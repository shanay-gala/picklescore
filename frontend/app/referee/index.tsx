// Referee home — list of live/upcoming matches the referee can run
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/ThemeContext";
import { api, clearAuth, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Card, EmptyState, Loader, Sub, statusColor } from "@/src/ui";

export default function RefereeHome() {
  const { theme } = useTheme();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const m = await api.listMatches();
      setMatches(m.filter((mm: any) => mm.status !== "completed"));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    getUser().then((u) => {
      if (!u || u.role !== "referee") { router.replace("/login"); return; }
      setUser(u);
    });
    load();
  }, [load]);

  useLive(() => load());

  const logout = async () => { await clearAuth(); router.replace("/"); };

  if (loading) return <Loader />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 2 }}>REFEREE</Text>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }}>{user?.name || "Match Official"}</Text>
        </View>
        <Pressable testID="logout-btn" onPress={logout} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
          <Ionicons name="log-out-outline" size={20} color={theme.onSurface} />
        </Pressable>
      </View>
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.brand} />}
        ListHeaderComponent={<Sub>Tap a match to start scoring</Sub>}
        ListEmptyComponent={<EmptyState icon="flag-outline" title="No assignable matches" subtitle="Ask admin to schedule a match." />}
        renderItem={({ item }) => {
          const sc = statusColor(item.status, theme);
          const ready = (item.team_a_player_ids?.length || 0) === 2 && (item.team_b_player_ids?.length || 0) === 2;
          return (
            <Pressable testID={`ref-match-${item.id}`} onPress={() => router.push(`/referee/match/${item.id}`)}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                  <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "800", letterSpacing: 1 }}>COURT {item.court_number}</Text>
                  <Badge label={item.status === "live" ? "● LIVE" : item.status} color={sc} />
                </View>
                <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900" }}>{item.team_a_name}</Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm, marginVertical: 2 }}>vs</Text>
                <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900" }}>{item.team_b_name}</Text>
                <View style={{ marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "900" }}>{item.score_a} – {item.score_b}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {!ready && <Ionicons name="warning" size={14} color={theme.warning} />}
                    <Text style={{ color: ready ? theme.brand : theme.warning, fontWeight: "800", fontSize: fontSize.sm }}>
                      {ready ? "READY →" : "PLAYERS NOT ASSIGNED"}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
