// Public Live Dashboard — tabs: Live | Upcoming | Completed | Leaderboard
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { useTheme } from "@/src/ThemeContext";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Card, EmptyState, Loader, Sub, statusColor } from "@/src/ui";

type TabKey = "live" | "upcoming" | "completed" | "leaderboard";
const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "live", label: "Live", icon: "radio" },
  { key: "upcoming", label: "Upcoming", icon: "time-outline" },
  { key: "completed", label: "Results", icon: "checkmark-done" },
  { key: "leaderboard", label: "Standings", icon: "trophy" },
];

export default function Dashboard() {
  const { theme, effectiveMode, setMode, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("live");
  const [matches, setMatches] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([api.listMatches(), api.leaderboard()]);
      setMatches(m);
      setBoard(l);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    getUser().then(setCurrentUser);
  }, [load]);

  useLive(() => load());

  const filtered = matches.filter((m) =>
    tab === "live" ? m.status === "live" :
    tab === "upcoming" ? m.status === "upcoming" :
    tab === "completed" ? m.status === "completed" :
    false,
  );

  const cycleTheme = () => {
    const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top"]}>
      {/* Sticky Header */}
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
          {currentUser?.role === "admin" ? (
            <Pressable testID="open-admin-btn" onPress={() => router.push("/admin")} hitSlop={8} style={[styles.iconBtn, { backgroundColor: theme.brand, borderColor: theme.brand }]}>
              <Ionicons name="settings" size={18} color={theme.onBrand} />
            </Pressable>
          ) : currentUser?.role === "referee" ? (
            <Pressable testID="open-referee-btn" onPress={() => router.push("/referee")} hitSlop={8} style={[styles.iconBtn, { backgroundColor: theme.brand, borderColor: theme.brand }]}>
              <Ionicons name="flag" size={18} color={theme.onBrand} />
            </Pressable>
          ) : (
            <Pressable testID="login-btn" onPress={() => router.push("/login")} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
              <Ionicons name="log-in-outline" size={18} color={theme.onSurface} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Sticky Tab Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, height: 56, alignItems: "center" }}
        style={{ height: 56, maxHeight: 56, borderBottomWidth: 1, borderBottomColor: theme.border }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const liveCount = t.key === "live" ? matches.filter((m) => m.status === "live").length : 0;
          return (
            <Pressable
              key={t.key}
              testID={`tab-${t.key}`}
              onPress={() => setTab(t.key)}
              style={{
                flexShrink: 0,
                paddingHorizontal: spacing.lg,
                height: 36,
                borderRadius: radius.pill,
                backgroundColor: active ? theme.brand : "transparent",
                borderWidth: 1,
                borderColor: active ? theme.brand : theme.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name={t.icon} size={14} color={active ? theme.onBrand : theme.onSurface} />
              <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "700", fontSize: fontSize.sm }}>{t.label}</Text>
              {liveCount > 0 && t.key === "live" && (
                <View style={{ backgroundColor: active ? theme.onBrand : theme.error, borderRadius: 999, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: active ? theme.brand : "#fff", fontSize: 10, fontWeight: "900" }}>{liveCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <Loader />
      ) : tab === "leaderboard" ? (
        <Leaderboard board={board} onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing} />
      ) : (
        <FlatList
          testID="match-list"
          data={filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.brand} />}
          renderItem={({ item }) => <MatchCard match={item} onPress={() => router.push(`/match/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState
              icon={tab === "live" ? "radio-outline" : tab === "upcoming" ? "calendar-outline" : "trophy-outline"}
              title={tab === "live" ? "No live matches right now" : tab === "upcoming" ? "No upcoming matches scheduled" : "No completed matches yet"}
              subtitle={tab === "live" ? "Live matches will appear here automatically." : tab === "upcoming" ? "Admin can schedule matches from the admin panel." : "Results will show once matches finish."}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

export function MatchCard({ match, onPress }: { match: any; onPress?: () => void }) {
  const { theme } = useTheme();
  const sc = statusColor(match.status, theme);
  return (
    <Pressable testID={`match-card-${match.id}`} onPress={onPress}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
            Court {match.court_number}
          </Text>
          <Badge label={match.status === "live" ? "● LIVE" : match.status} color={sc} testID={`badge-${match.id}`} />
        </View>
        <Row name={match.team_a_name} score={match.score_a} players={match.team_a_players} accent={theme.brand} />
        <View style={{ height: 1, backgroundColor: theme.border, marginVertical: spacing.sm }} />
        <Row name={match.team_b_name} score={match.score_b} players={match.team_b_players} accent={theme.brandTertiary} />
      </Card>
    </Pressable>
  );
}

function Row({ name, score, players, accent }: { name: string; score: number; players: any[]; accent: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 4, height: 36, backgroundColor: accent, borderRadius: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 0.5 }} numberOfLines={1}>{name}</Text>
        {players && players.length > 0 && (
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
            {players.map((p: any) => p.name).join(" • ")}
          </Text>
        )}
      </View>
      <Text style={{ color: theme.onSurface, fontSize: 40, fontWeight: "900", minWidth: 56, textAlign: "right" }}>{score}</Text>
    </View>
  );
}

function Leaderboard({ board, onRefresh, refreshing }: { board: any[]; onRefresh: () => void; refreshing: boolean }) {
  const { theme } = useTheme();
  return (
    <ScrollView
      testID="leaderboard"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
    >
      <View style={[styles.lbHead, { backgroundColor: theme.surfaceTertiary }]}>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, width: 32 }]}>#</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, flex: 1 }]}>Team</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, width: 28, textAlign: "center" }]}>P</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, width: 28, textAlign: "center" }]}>W</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, width: 28, textAlign: "center" }]}>L</Text>
        <Text style={[styles.lbH, { color: theme.onSurfaceSecondary, width: 40, textAlign: "center" }]}>+/-</Text>
        <Text style={[styles.lbH, { color: theme.brand, width: 36, textAlign: "right" }]}>PTS</Text>
      </View>
      {board.map((r) => (
        <View key={r.team_id} testID={`lb-row-${r.team_id}`} style={[styles.lbRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.lbCell, { color: r.rank <= 3 ? theme.brand : theme.onSurfaceSecondary, width: 32, fontWeight: "900" }]}>{r.rank}</Text>
          <Text style={[styles.lbCell, { color: theme.onSurface, flex: 1, fontWeight: "800" }]} numberOfLines={1}>{r.team_name}</Text>
          <Text style={[styles.lbCell, { color: theme.onSurface, width: 28, textAlign: "center" }]}>{r.matches_played}</Text>
          <Text style={[styles.lbCell, { color: theme.success, width: 28, textAlign: "center", fontWeight: "800" }]}>{r.wins}</Text>
          <Text style={[styles.lbCell, { color: theme.error, width: 28, textAlign: "center", fontWeight: "800" }]}>{r.losses}</Text>
          <Text style={[styles.lbCell, { color: theme.onSurface, width: 40, textAlign: "center" }]}>{r.points_diff > 0 ? `+${r.points_diff}` : r.points_diff}</Text>
          <Text style={[styles.lbCell, { color: theme.brand, width: 36, textAlign: "right", fontWeight: "900", fontSize: fontSize.lg }]}>{r.tournament_points}</Text>
        </View>
      ))}
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
