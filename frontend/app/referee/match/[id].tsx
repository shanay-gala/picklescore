// HERO: Referee Match Scoring — full lifecycle + player picker + edit score
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/src/ThemeContext";
import { api } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Btn, Input, Loader, Sub } from "@/src/ui";

export default function ScoringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [m, setM] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showEdit, setShowEdit] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const match = await api.getMatch(id);
      setM(match);
      // load full teams to access player rosters for picker
      const teams = await api.listTeams();
      setTeamA(teams.find((t: any) => t.id === match.team_a_id));
      setTeamB(teams.find((t: any) => t.id === match.team_b_id));
    } catch {}
  };

  useEffect(() => { load(); }, [id]);
  useLive((msg) => { if (msg.type === "fixture_changed" && msg.match_id === id) load(); });

  if (!m) return <Loader />;

  const hap = (kind: "impact" | "warn" | "success") => {
    if (Platform.OS === "web") return;
    if (kind === "impact") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (kind === "warn") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const safe = async (label: string, fn: () => Promise<any>) => {
    setBusy(true); setErr("");
    try { const next = await fn(); if (next) setM(next); return next; }
    catch (e: any) { setErr(e?.message || `${label} failed`); }
    finally { setBusy(false); }
  };

  const confirm = (msg: string, cb: () => void) => {
    if (Platform.OS === "web") { if (window.confirm(msg)) cb(); return; }
    Alert.alert("Confirm", msg, [{ text: "Cancel", style: "cancel" }, { text: "OK", onPress: cb }]);
  };

  const live = m.status === "live";
  const paused = m.status === "paused";
  const completed = m.status === "completed";
  const scheduled = m.status === "scheduled";
  const playersAssigned = (m.team_a_player_ids?.length || 0) === 2 && (m.team_b_player_ids?.length || 0) === 2;

  const score = (side: "a" | "b") => {
    if (!live || busy) return;
    hap("impact");
    safe("score", () => api.scorePoint(id!, side));
  };

  // === Player picker for scheduled+unassigned matches ===
  if (scheduled && !playersAssigned && teamA && teamB) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
        <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
          <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={10} style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-back" size={28} color={theme.onSurface} />
          </Pressable>
          <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1 }}>R{m.round_number} · M{m.match_number}</Text>
          <View style={{ width: 28 }} />
        </View>
        <PlayerPicker
          match={m} teamA={teamA} teamB={teamB}
          busy={busy} err={err}
          onSave={(aIds, bIds) => safe("assign", () => api.updateMatch(id!, { team_a_player_ids: aIds, team_b_player_ids: bIds }))}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top", "bottom"]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={28} color={theme.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>
            COURT {m.court_number} · R{m.round_number} M{m.match_number}
          </Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, marginTop: 2 }}>
            {scheduled ? "Not started" : paused ? "⏸ Paused" : live ? "● Live" : "✓ Completed"}
          </Text>
        </View>
        <Pressable testID="edit-score-open" onPress={() => setShowEdit(true)} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="create-outline" size={24} color={theme.onSurface} />
        </Pressable>
      </View>

      {err ? <Text testID="match-err" style={{ color: theme.error, textAlign: "center", padding: spacing.sm }}>{err}</Text> : null}

      <Pressable testID="score-a-btn" disabled={!live || busy} onPress={() => score("a")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.surfaceSecondary, borderColor: theme.brand, opacity: !live ? 0.85 : pressed ? 0.85 : 1 }]}>
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM A</Text>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{m.team_a_name}</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
            {m.team_a_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-a-value" style={{ color: theme.onSurface, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>{m.score_a}</Text>
        {live && (
          <View style={{ position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={theme.brand} />
            <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1 }}>TAP +1</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.actions}>
        {scheduled ? (
          <Pressable testID="start-match-btn" disabled={busy} onPress={() => safe("start", () => api.startMatch(id!))}
            style={[styles.actionBtn, { backgroundColor: theme.brand, flex: 1 }]}>
            <Ionicons name="play" size={22} color={theme.onBrand} />
            <Text style={{ color: theme.onBrand, fontWeight: "900", letterSpacing: 1 }}>START MATCH</Text>
          </Pressable>
        ) : paused ? (
          <>
            <Pressable testID="resume-match-btn" disabled={busy} onPress={() => safe("resume", () => api.resumeMatch(id!))}
              style={[styles.actionBtn, { backgroundColor: theme.brand, flex: 2 }]}>
              <Ionicons name="play" size={20} color={theme.onBrand} />
              <Text style={{ color: theme.onBrand, fontWeight: "900", letterSpacing: 1 }}>RESUME</Text>
            </Pressable>
            <Pressable testID="finish-match-btn" disabled={busy}
              onPress={() => confirm("Finish this match now?", () => { hap("success"); safe("finish", async () => { const r = await api.finishMatch(id!); setTimeout(() => router.back(), 600); return r; }); })}
              style={[styles.actionBtn, { backgroundColor: theme.error, flex: 1 }]}>
              <Ionicons name="flag" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>END</Text>
            </Pressable>
          </>
        ) : completed ? (
          <View style={[styles.actionBtn, { backgroundColor: theme.success, flex: 1 }]}>
            <Ionicons name="trophy" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1 }}>
              {m.score_a === m.score_b ? "MATCH TIED" :
                m.score_a > m.score_b ? `${m.team_a_name} WINS` : `${m.team_b_name} WINS`}
            </Text>
          </View>
        ) : (
          <>
            <Pressable testID="undo-btn" disabled={busy} onPress={() => { hap("warn"); safe("undo", () => api.undoPoint(id!)); }}
              style={[styles.actionBtn, { backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="arrow-undo" size={20} color={theme.onSurface} />
              <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: fontSize.sm }}>UNDO</Text>
            </Pressable>
            <Pressable testID="pause-match-btn" disabled={busy} onPress={() => safe("pause", () => api.pauseMatch(id!))}
              style={[styles.actionBtn, { backgroundColor: theme.warning }]}>
              <Ionicons name="pause" size={20} color="#000" />
              <Text style={{ color: "#000", fontWeight: "800", fontSize: fontSize.sm }}>PAUSE</Text>
            </Pressable>
            <Pressable testID="finish-match-btn" disabled={busy}
              onPress={() => confirm("End this match? Winner will be locked in.", () => { hap("success"); safe("finish", async () => { const r = await api.finishMatch(id!); setTimeout(() => router.back(), 600); return r; }); })}
              style={[styles.actionBtn, { backgroundColor: theme.error, flex: 1.4 }]}>
              <Ionicons name="flag" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: fontSize.sm }}>END</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable testID="score-b-btn" disabled={!live || busy} onPress={() => score("b")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.brandTertiary, borderColor: theme.brand, opacity: !live ? 0.85 : pressed ? 0.85 : 1 }]}>
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM B</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{m.team_b_name}</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, opacity: 0.7 }} numberOfLines={1}>
            {m.team_b_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-b-value" style={{ color: theme.onBrandTertiary, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>{m.score_b}</Text>
        {live && (
          <View style={{ position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={theme.onBrandTertiary} />
            <Text style={{ color: theme.onBrandTertiary, fontWeight: "900", letterSpacing: 1 }}>TAP +1</Text>
          </View>
        )}
      </Pressable>

      <EditScoreModal visible={showEdit} match={m} onClose={() => setShowEdit(false)}
        onSave={(a, b) => safe("edit", async () => { const r = await api.updateMatch(id!, { score_a: a, score_b: b }); setShowEdit(false); return r; })} />
    </SafeAreaView>
  );
}

function PlayerPicker({ match, teamA, teamB, busy, err, onSave }: any) {
  const { theme } = useTheme();
  const [aIds, setAIds] = useState<string[]>(match.team_a_player_ids || []);
  const [bIds, setBIds] = useState<string[]>(match.team_b_player_ids || []);

  const toggle = (list: string[], setter: any, pid: string) => {
    if (list.includes(pid)) setter(list.filter((x) => x !== pid));
    else if (list.length < 2) setter([...list, pid]);
  };

  const ready = aIds.length === 2 && bIds.length === 2;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 }}>
      <View>
        <Text style={{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "900" }}>Pick players</Text>
        <Sub>Select 2 players from each team for this match.</Sub>
      </View>

      <View>
        <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1, marginBottom: spacing.sm }}>
          TEAM A · {teamA.name} · {aIds.length}/2
        </Text>
        <View style={{ gap: spacing.xs }}>
          {teamA.players.map((p: any) => {
            const on = aIds.includes(p.id);
            const disabled = !on && aIds.length >= 2;
            return (
              <Pressable key={p.id} testID={`pa-${p.id}`} disabled={disabled} onPress={() => toggle(aIds, setAIds, p.id)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
                  borderRadius: radius.md, borderWidth: on ? 2 : 1,
                  borderColor: on ? theme.brand : theme.border,
                  backgroundColor: on ? theme.brandTertiary : theme.surfaceSecondary,
                  opacity: disabled ? 0.4 : 1,
                }}>
                <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? theme.brand : theme.onSurfaceSecondary} />
                <Text style={{ flex: 1, color: theme.onSurface, fontWeight: p.is_captain ? "900" : "700" }}>
                  {p.is_captain ? "★ " : ""}{p.name}
                </Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }}>{p.category}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1, marginBottom: spacing.sm }}>
          TEAM B · {teamB.name} · {bIds.length}/2
        </Text>
        <View style={{ gap: spacing.xs }}>
          {teamB.players.map((p: any) => {
            const on = bIds.includes(p.id);
            const disabled = !on && bIds.length >= 2;
            return (
              <Pressable key={p.id} testID={`pb-${p.id}`} disabled={disabled} onPress={() => toggle(bIds, setBIds, p.id)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
                  borderRadius: radius.md, borderWidth: on ? 2 : 1,
                  borderColor: on ? theme.brand : theme.border,
                  backgroundColor: on ? theme.brandTertiary : theme.surfaceSecondary,
                  opacity: disabled ? 0.4 : 1,
                }}>
                <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? theme.brand : theme.onSurfaceSecondary} />
                <Text style={{ flex: 1, color: theme.onSurface, fontWeight: p.is_captain ? "900" : "700" }}>
                  {p.is_captain ? "★ " : ""}{p.name}
                </Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }}>{p.category}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {err ? <Text style={{ color: theme.error, textAlign: "center" }}>{err}</Text> : null}

      <Btn testID="save-players-btn" title={busy ? "Saving..." : "Confirm Players"} icon="checkmark-circle" variant="primary"
        disabled={!ready || busy} onPress={() => onSave(aIds, bIds)} />
    </ScrollView>
  );
}

function EditScoreModal({ visible, match, onClose, onSave }: any) {
  const { theme } = useTheme();
  const [a, setA] = useState(String(match.score_a));
  const [b, setB] = useState(String(match.score_b));
  useEffect(() => { setA(String(match.score_a)); setB(String(match.score_b)); }, [match.id, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
        <View style={{ width: "100%", maxWidth: 420, backgroundColor: theme.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg }}>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }}>Edit Score</Text>
          <Sub>Override scores manually (use to correct mistakes).</Sub>
          <View style={{ height: spacing.md }} />
          <Text style={{ color: theme.brand, fontWeight: "800", marginBottom: 4 }} numberOfLines={1}>{match.team_a_name}</Text>
          <Input testID="edit-score-a-input" value={a} onChangeText={(v: string) => setA(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={3} />
          <View style={{ height: spacing.sm }} />
          <Text style={{ color: theme.brand, fontWeight: "800", marginBottom: 4 }} numberOfLines={1}>{match.team_b_name}</Text>
          <Input testID="edit-score-b-input" value={b} onChangeText={(v: string) => setB(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={3} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <Btn title="Cancel" variant="ghost" onPress={onClose} testID="edit-score-cancel" />
            <Btn title="Save" variant="primary" testID="edit-score-save"
              onPress={() => onSave(parseInt(a) || 0, parseInt(b) || 0)} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  scoreBlock: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 2, margin: spacing.md, borderRadius: radius.lg },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, borderRadius: radius.md, minHeight: 52 },
});
