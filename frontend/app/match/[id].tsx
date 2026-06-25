// Public match detail page — live-updating
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/ThemeContext";
import { api } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Card, Loader, Sub, statusColor } from "@/src/ui";

export default function MatchView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [match, setMatch] = useState<any>(null);

  const load = async () => {
    if (!id) return;
    try { setMatch(await api.getMatch(id)); } catch {}
  };

  useEffect(() => { load(); }, [id]);
  useLive((msg) => {
    if (msg.type === "match_changed" && msg.match_id === id) load();
  });

  if (!match) return <Loader />;

  const sc = statusColor(match.status, theme);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={8} style={{ padding: spacing.sm }}>
          <Ionicons name="chevron-back" size={26} color={theme.onSurface} />
        </Pressable>
        <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 1 }}>COURT {match.court_number}</Text>
        <Badge label={match.status === "live" ? "● LIVE" : match.status} color={sc} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <TeamBlock name={match.team_a_name} players={match.team_a_players} score={match.score_a} accent={theme.brand} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xxl, fontWeight: "900" }}>VS</Text>
        </View>
        <TeamBlock name={match.team_b_name} players={match.team_b_players} score={match.score_b} accent={theme.brandTertiary} />

        <Card>
          <Sub>Target Score</Sub>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "800" }}>{match.target_score}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function TeamBlock({ name, players, score, accent }: { name: string; players: any[]; score: number; accent: string }) {
  const { theme } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ width: 6, height: 28, backgroundColor: accent, borderRadius: 3 }} />
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }} numberOfLines={1}>{name}</Text>
          </View>
          {players?.length ? (
            <View style={{ marginLeft: 14, gap: 2 }}>
              {players.map((p: any) => (
                <Text key={p.id} style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm }}>• {p.name}</Text>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm, marginLeft: 14 }}>Players not assigned</Text>
          )}
        </View>
        <Text style={{ color: theme.onSurface, fontSize: 72, fontWeight: "900", minWidth: 90, textAlign: "right" }}>{score}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
});
