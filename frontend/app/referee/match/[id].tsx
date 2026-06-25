// HERO: Referee Match Scoring — two massive +1 blocks with start/pause/undo/finish
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/src/ThemeContext";
import { api } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Loader } from "@/src/ui";

export default function ScoringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [m, setM] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!id) return;
    try { setM(await api.getMatch(id)); } catch {}
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
    try { const next = await fn(); setM(next); }
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

  const score = (side: "a" | "b") => {
    if (!live || busy) return;
    hap("impact");
    safe("score", () => api.scorePoint(id!, side));
  };

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
            {scheduled ? "Not started" : paused ? "⏸ Paused" : live ? "● Live" : completed ? "✓ Completed" : m.status}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {err ? <Text testID="match-err" style={{ color: theme.error, textAlign: "center", padding: spacing.sm }}>{err}</Text> : null}

      {/* Team A block */}
      <Pressable testID="score-a-btn" disabled={!live || busy} onPress={() => score("a")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.surfaceSecondary, borderColor: theme.brand, opacity: !live ? 0.85 : pressed ? 0.85 : 1 }]}>
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM A</Text>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{m.team_a_name}</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
            {m.team_a_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-a-value" style={{ color: theme.onSurface, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>
          {m.score_a}
        </Text>
        {live && (
          <View style={{ position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={theme.brand} />
            <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1 }}>TAP +1</Text>
          </View>
        )}
      </Pressable>

      {/* Action bar */}
      <View style={styles.actions}>
        {scheduled ? (
          <Pressable testID="start-match-btn" disabled={busy}
            onPress={() => safe("start", () => api.startMatch(id!))}
            style={[styles.actionBtn, { backgroundColor: theme.brand, flex: 1 }]}>
            <Ionicons name="play" size={22} color={theme.onBrand} />
            <Text style={{ color: theme.onBrand, fontWeight: "900", letterSpacing: 1 }}>START MATCH</Text>
          </Pressable>
        ) : paused ? (
          <>
            <Pressable testID="resume-match-btn" disabled={busy}
              onPress={() => safe("resume", () => api.resumeMatch(id!))}
              style={[styles.actionBtn, { backgroundColor: theme.brand, flex: 2 }]}>
              <Ionicons name="play" size={20} color={theme.onBrand} />
              <Text style={{ color: theme.onBrand, fontWeight: "900", letterSpacing: 1 }}>RESUME</Text>
            </Pressable>
            <Pressable testID="finish-match-btn" disabled={busy}
              onPress={() => confirm("Finish this match now?", () => { hap("success"); safe("finish", async () => { const r = await api.finishMatch(id!); setTimeout(() => router.back(), 600); return r; }); })}
              style={[styles.actionBtn, { backgroundColor: theme.error, flex: 1 }]}>
              <Ionicons name="flag" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>FINISH</Text>
            </Pressable>
          </>
        ) : completed ? (
          <View style={[styles.actionBtn, { backgroundColor: theme.success, flex: 1 }]}>
            <Ionicons name="trophy" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1 }}>MATCH COMPLETED</Text>
          </View>
        ) : (
          <>
            <Pressable testID="undo-btn" disabled={busy}
              onPress={() => { hap("warn"); safe("undo", () => api.undoPoint(id!)); }}
              style={[styles.actionBtn, { backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="arrow-undo" size={20} color={theme.onSurface} />
              <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: fontSize.sm }}>UNDO</Text>
            </Pressable>
            <Pressable testID="pause-match-btn" disabled={busy}
              onPress={() => safe("pause", () => api.pauseMatch(id!))}
              style={[styles.actionBtn, { backgroundColor: theme.warning }]}>
              <Ionicons name="pause" size={20} color="#000" />
              <Text style={{ color: "#000", fontWeight: "800", fontSize: fontSize.sm }}>PAUSE</Text>
            </Pressable>
            <Pressable testID="finish-match-btn" disabled={busy}
              onPress={() => confirm("End this match? Score will be locked.", () => { hap("success"); safe("finish", async () => { const r = await api.finishMatch(id!); setTimeout(() => router.back(), 600); return r; }); })}
              style={[styles.actionBtn, { backgroundColor: theme.error, flex: 1.4 }]}>
              <Ionicons name="flag" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: fontSize.sm }}>END MATCH</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Team B block */}
      <Pressable testID="score-b-btn" disabled={!live || busy} onPress={() => score("b")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.brandTertiary, borderColor: theme.brand, opacity: !live ? 0.85 : pressed ? 0.85 : 1 }]}>
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM B</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{m.team_b_name}</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, opacity: 0.7 }} numberOfLines={1}>
            {m.team_b_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-b-value" style={{ color: theme.onBrandTertiary, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>
          {m.score_b}
        </Text>
        {live && (
          <View style={{ position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={theme.onBrandTertiary} />
            <Text style={{ color: theme.onBrandTertiary, fontWeight: "900", letterSpacing: 1 }}>TAP +1</Text>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  scoreBlock: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 2, margin: spacing.md, borderRadius: radius.lg },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, borderRadius: radius.md, minHeight: 52 },
});
