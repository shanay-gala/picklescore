// Fixture detail page (public + referee + admin view)
// Shows Team A vs B, running totals, 4 rounds × 3 matches.
// If a referee or admin is logged in, exposes lifecycle controls.
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { useTheme } from "@/src/ThemeContext";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Btn, Card, Loader, Sub } from "@/src/ui";

export default function FixturePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [fx, setFx] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try { setFx(await api.getFixture(id)); } catch {}
  }, [id]);

  useEffect(() => { load(); getUser().then(setMe); }, [load]);
  useLive((msg) => {
    if (msg.type === "fixture_changed" && msg.fixture_id === id) load();
  });

  if (!fx) return <Loader />;
  const canControl = me?.role === "admin" || me?.role === "referee";

  const safe = async (fn: () => Promise<any>) => {
    setBusy(true); setErr("");
    try { await fn(); await load(); }
    catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const confirm = (msg: string, cb: () => void) => {
    if (Platform.OS === "web") { if (window.confirm(msg)) cb(); return; }
    Alert.alert("Confirm", msg, [{ text: "Cancel", style: "cancel" }, { text: "OK", onPress: cb }]);
  };

  const sc = fx.status === "live" ? theme.error : fx.status === "completed" ? theme.success : theme.onSurfaceSecondary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={8} style={{ padding: spacing.sm }}>
          <Ionicons name="chevron-back" size={26} color={theme.onSurface} />
        </Pressable>
        <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900", letterSpacing: 1 }}>COURT {fx.court_number}</Text>
        <Badge label={fx.status === "live" ? "● LIVE" : fx.status.toUpperCase()} color={sc} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}>
        {/* Score header */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM A</Text>
              <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900", marginTop: 2, textAlign: "center" }} numberOfLines={2}>{fx.team_a_name}</Text>
              <Text style={{ color: theme.onSurface, fontSize: 56, fontWeight: "900", marginTop: spacing.sm }}>{fx.total_a}</Text>
            </View>
            <View style={{ paddingHorizontal: spacing.md, alignItems: "center" }}>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xl, fontWeight: "900" }}>VS</Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, marginTop: 4 }}>{fx.matches_completed}/{fx.matches_total}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM B</Text>
              <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900", marginTop: 2, textAlign: "center" }} numberOfLines={2}>{fx.team_b_name}</Text>
              <Text style={{ color: theme.onSurface, fontSize: 56, fontWeight: "900", marginTop: spacing.sm }}>{fx.total_b}</Text>
            </View>
          </View>
          {fx.winner_team_id && (
            <View style={{ marginTop: spacing.md, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.brand, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill }}>
                <Ionicons name="trophy" size={16} color={theme.onBrand} />
                <Text style={{ color: theme.onBrand, fontWeight: "900", letterSpacing: 1 }}>
                  {fx.winner_team_id === fx.team_a_id ? fx.team_a_name : fx.team_b_name} WINS
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Fixture-level controls */}
        {canControl && fx.status === "scheduled" && (
          <Btn title={busy ? "..." : "Start Fixture"} icon="play-circle" testID="start-fixture-btn"
            onPress={() => confirm("Start this fixture? It will go LIVE on the public dashboard.", () => safe(() => api.startFixture(fx.id)))} disabled={busy} />
        )}
        {canControl && fx.status === "live" && fx.matches_completed === fx.matches_total && (
          <Btn title={busy ? "..." : "Complete Fixture"} icon="trophy" testID="complete-fixture-btn"
            onPress={() => confirm("Mark this fixture as completed? Standings will update.", () => safe(() => api.completeFixture(fx.id)))} disabled={busy} />
        )}
        {err ? <Text style={{ color: theme.error }}>{err}</Text> : null}

        {/* Rounds */}
        {fx.rounds.map((rd: any) => (
          <RoundBlock key={rd.round_number} round={rd} fixture={fx} canControl={canControl} role={me?.role}
            busy={busy} safe={safe} confirm={confirm} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function RoundBlock({ round, fixture, canControl, role, busy, safe, confirm }: any) {
  const { theme } = useTheme();
  const rsc = round.status === "live" ? theme.error : round.status === "completed" ? theme.success : theme.onSurfaceSecondary;
  const matchesDone = round.matches.filter((m: any) => m.status === "completed").length;
  const canStartRound = canControl && fixture.status === "live" && round.status === "scheduled";
  const canCompleteRound = canControl && round.status === "live" && matchesDone === round.matches.length;

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", letterSpacing: 1 }}>ROUND {round.round_number}</Text>
          <Sub>{matchesDone}/{round.matches.length} matches done · {round.total_a}–{round.total_b}</Sub>
        </View>
        <Badge label={round.status === "live" ? "● LIVE" : round.status.toUpperCase()} color={rsc} />
      </View>

      {canStartRound && (
        <View style={{ marginTop: spacing.sm }}>
          <Btn small title="Start Round" icon="play" testID={`start-round-${round.round_number}`}
            onPress={() => safe(() => api.startRound(fixture.id, round.round_number))} disabled={busy} />
        </View>
      )}
      {canCompleteRound && (
        <View style={{ marginTop: spacing.sm }}>
          <Btn small title="Complete Round" icon="checkmark-done" variant="secondary" testID={`complete-round-${round.round_number}`}
            onPress={() => confirm(`Complete Round ${round.round_number}?`, () => safe(() => api.completeRound(fixture.id, round.round_number)))} disabled={busy} />
        </View>
      )}

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {round.matches.map((m: any) => (
          <MatchRow key={m.id} m={m} fixture={fixture} round={round} canControl={canControl} role={role} />
        ))}
      </View>
    </Card>
  );
}

function MatchRow({ m, fixture, round, canControl, role }: any) {
  const { theme } = useTheme();
  const msc = m.status === "live" ? theme.error : m.status === "completed" ? theme.success : m.status === "paused" ? theme.warning : theme.onSurfaceSecondary;
  const ready = (m.team_a_player_ids?.length || 0) === 2 && (m.team_b_player_ids?.length || 0) === 2;
  const refereeCanScore = role === "referee" && (m.status === "live" || m.status === "paused" || (m.status === "scheduled" && round.status === "live" && ready));

  const goScore = () => router.push(`/referee/match/${m.id}`);

  return (
    <Pressable testID={`match-row-${m.id}`} onPress={canControl ? goScore : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.onSurface, fontWeight: "900" }}>M{m.match_number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {ready ? (
            <>
              <Text style={{ color: theme.onSurface, fontSize: fontSize.sm, fontWeight: "700" }} numberOfLines={1}>
                {m.team_a_players.map((p: any) => p.name.split(" ")[0]).join(" + ")}
              </Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
                vs {m.team_b_players.map((p: any) => p.name.split(" ")[0]).join(" + ")}
              </Text>
            </>
          ) : (
            <Text style={{ color: theme.warning, fontSize: fontSize.xs, fontWeight: "700" }}>⚠ Players not assigned</Text>
          )}
        </View>
        <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", minWidth: 60, textAlign: "right" }}>
          {m.score_a}–{m.score_b}
        </Text>
        <View style={{ width: 70, alignItems: "flex-end" }}>
          <Badge label={m.status === "live" ? "● LIVE" : m.status === "paused" ? "⏸ PAUSE" : m.status.toUpperCase()} color={msc} />
          {refereeCanScore && (
            <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "800", marginTop: 4 }}>TAP →</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
});
