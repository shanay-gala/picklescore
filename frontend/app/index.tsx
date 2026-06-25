// Public Live Dashboard — tabs show Fixtures (not matches)
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { useTheme } from "@/src/ThemeContext";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Card, EmptyState, Loader, Sub } from "@/src/ui";

type TabKey = "live" | "scheduled" | "completed" | "leaderboard";
const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "live", label: "Live", icon: "radio" },
  { key: "scheduled", label: "Next", icon: "time-outline" },
  { key: "completed", label: "Results", icon: "checkmark-done" },
  { key: "leaderboard", label: "Standings", icon: "trophy" },
];

export function fixtureStatusColor(status: string, theme: any) {
  if (status === "live") return theme.error;
  if (status === "completed") return theme.success;
  return theme.onSurfaceSecondary;
}

export default function Dashboard() {
  const { theme, setMode, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("live");
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [f, l] = await Promise.all([api.listFixtures(), api.leaderboard()]);
      setFixtures(f); setBoard(l);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); getUser().then(setMe); }, [load]);
  useLive(() => load());

  const filtered = fixtures.filter((f) =>
    tab === "live" ? f.status === "live" :
    tab === "scheduled" ? f.status === "scheduled" :
    tab === "completed" ? f.status === "completed" :
    false,
  );

  const cycleTheme = () => setMode(mode === "system" ? "light" : mode === "light" ? "dark" : "system");
  const liveCount = fixtures.filter((f) => f.status === "live").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ width: 36, height: 36, backgroundColor: theme.brand, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="tennisball" size={20} color={theme.onBrand} />
          </View>
          <View>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", letterSpacing: 1 }}>PICKLESCORE</Text>
            <Sub>Live Tournament Scoring</Sub>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Pressable testID="theme-toggle-btn" onPress={cycleTheme} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
            <Ionicons name={mode === "system" ? "phone-portrait-outline" : mode === "light" ? "sunny" : "moon"} size={18} color={theme.onSurface} />
          </Pressable>
          {me?.role === "admin" || me?.role === "referee" ? (
            <Pressable testID="open-admin-btn" onPress={() => router.push("/admin")} hitSlop={8} style={[styles.iconBtn, { backgroundColor: theme.brand, borderColor: theme.brand }]}>
              <Ionicons name="construct" size={18} color={theme.onBrand} />
            </Pressable>
          ) : (
            <Pressable testID="login-btn" onPress={() => router.push("/login")} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
              <Ionicons name="log-in-outline" size={18} color={theme.onSurface} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, height: 56, alignItems: "center" }}
        style={{ height: 56, maxHeight: 56, borderBottomWidth: 1, borderBottomColor: theme.border }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => setTab(t.key)}
              style={{ flexShrink: 0, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill,
                backgroundColor: active ? theme.brand : "transparent", borderWidth: 1, borderColor: active ? theme.brand : theme.border,
                flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name={t.icon} size={14} color={active ? theme.onBrand : theme.onSurface} />
              <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "700", fontSize: fontSize.sm }}>{t.label}</Text>
              {t.key === "live" && liveCount > 0 && (
                <View style={{ backgroundColor: active ? theme.onBrand : theme.error, borderRadius: 999, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: active ? theme.brand : "#fff", fontSize: 10, fontWeight: "900" }}>{liveCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? <Loader /> : tab === "leaderboard" ? (
        <Leaderboard board={board} onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} />
      ) : (
        <FlatList
          testID="fixture-list"
          data={filtered}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.brand} />}
          renderItem={({ item }) => <FixtureCard fixture={item} onPress={() => router.push(`/fixture/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState
              icon={tab === "live" ? "radio-outline" : tab === "scheduled" ? "calendar-outline" : "trophy-outline"}
              title={tab === "live" ? "No live fixtures right now" : tab === "scheduled" ? "No fixtures scheduled" : "No completed fixtures yet"}
              subtitle={tab === "live" ? "Live fixtures will appear here automatically." : tab === "scheduled" ? "Admin schedules fixtures from the admin panel." : "Results will show once fixtures finish."}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

export function FixtureCard({ fixture, onPress }: { fixture: any; onPress?: () => void }) {
  const { theme } = useTheme();
  const sc = fixtureStatusColor(fixture.status, theme);
  return (
    <Pressable testID={`fixture-card-${fixture.id}`} onPress={onPress}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1 }}>
            COURT {fixture.court_number} · {fixture.matches_completed}/{fixture.matches_total} matches
          </Text>
          <Badge label={fixture.status === "live" ? "● LIVE" : fixture.status.toUpperCase()} color={sc} testID={`badge-${fixture.id}`} />
        </View>
        <FRow name={fixture.team_a_name} score={fixture.total_a} accent={theme.brand} winner={fixture.winner_team_id === fixture.team_a_id} />
        <View style={{ height: 1, backgroundColor: theme.border, marginVertical: spacing.sm }} />
        <FRow name={fixture.team_b_name} score={fixture.total_b} accent={theme.brandTertiary} winner={fixture.winner_team_id === fixture.team_b_id} />
        {fixture.status === "live" && fixture.matches_live > 0 && (
          <View style={{ marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.error }} />
            <Text style={{ color: theme.error, fontSize: fontSize.xs, fontWeight: "800" }}>MATCH IN PROGRESS</Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function FRow({ name, score, accent, winner }: { name: string; score: number; accent: string; winner?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 4, height: 36, backgroundColor: accent, borderRadius: 2 }} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {winner && <Ionicons name="trophy" size={14} color={theme.brand} />}
        <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>{name}</Text>
      </View>
      <Text style={{ color: theme.onSurface, fontSize: 36, fontWeight: "900", minWidth: 56, textAlign: "right" }}>{score}</Text>
    </View>
  );
}

function Leaderboard({ board, onRefresh, refreshing }: { board: any[]; onRefresh: () => void; refreshing: boolean }) {
  const { theme } = useTheme();
  const rankColor = (rank: number) =>
    rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : theme.onSurfaceSecondary;
  return (
    <ScrollView testID="leaderboard" contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}>
      <View style={{ marginBottom: spacing.sm }}>
        <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Points-based standings</Text>
        <Sub>Tournament Points = total points scored across every match in every fixture.</Sub>
      </View>
      <View style={[styles.lbHead, { backgroundColor: theme.surfaceTertiary }]}>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, width: 36 }]}>#</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, flex: 1 }]}>Team</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, width: 28, textAlign: "center" }]}>FW</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, width: 28, textAlign: "center" }]}>MW</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, width: 44, textAlign: "center" }]}>+/-</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceTertiary, width: 56, textAlign: "right" }]}>PTS</Text>
      </View>
      {board.map((r) => {
        const isTop = r.rank <= 3;
        return (
          <View key={r.team_id} testID={`lb-row-${r.team_id}`} style={[
            styles.lbRow,
            { backgroundColor: theme.surfaceSecondary, borderColor: isTop ? theme.brand : theme.border, borderWidth: isTop ? 2 : 1 },
          ]}>
            <View style={{ width: 36, alignItems: "flex-start" }}>
              <View style={{
                minWidth: 28, height: 28, borderRadius: 14,
                backgroundColor: isTop ? rankColor(r.rank) : theme.surfaceTertiary,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
              }}>
                <Text style={{ color: isTop ? "#111" : theme.onSurface, fontWeight: "900", fontSize: fontSize.sm }}>{r.rank}</Text>
              </View>
            </View>
            <Text style={[styles.lbCell, { color: theme.onSurface, flex: 1, fontWeight: "800" }]} numberOfLines={1}>{r.team_name}</Text>
            <Text style={[styles.lbCell, { color: theme.onSurface, width: 28, textAlign: "center", fontWeight: "800" }]}>{r.fixture_wins}</Text>
            <Text style={[styles.lbCell, { color: theme.onSurface, width: 28, textAlign: "center" }]}>{r.match_wins}</Text>
            <Text style={[styles.lbCell, { color: r.points_diff > 0 ? theme.success : r.points_diff < 0 ? theme.error : theme.onSurfaceSecondary, width: 44, textAlign: "center", fontWeight: "700" }]}>
              {r.points_diff > 0 ? `+${r.points_diff}` : r.points_diff}
            </Text>
            <View style={{ width: 56, alignItems: "flex-end" }}>
              <View style={{
                backgroundColor: theme.brand, paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: radius.md, minWidth: 44, alignItems: "center",
              }}>
                <Text style={{ color: theme.onBrand, fontWeight: "900", fontSize: fontSize.lg }}>{r.tournament_points}</Text>
              </View>
            </View>
          </View>
        );
      })}
      <View style={{ marginTop: spacing.lg, gap: 4 }}>
        <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }}>FW = Fixture Wins · MW = Match Wins · +/- = Points Diff · PTS = Total points scored</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  lbHead: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm, alignItems: "center" },
  lbH: { fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  lbRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1 },
  lbCell: { fontSize: fontSize.base },
});
