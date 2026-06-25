// HERO: Referee Match Scoring — two massive +1 blocks
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
  const [match, setMatch] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try { setMatch(await api.getMatch(id)); } catch {}
  };

  useEffect(() => { load(); }, [id]);
  useLive((msg) => { if (msg.type === "match_changed" && msg.match_id === id) load(); });

  if (!match) return <Loader />;

  const hap = (kind: "impact" | "warn" | "success") => {
    if (Platform.OS === "web") return;
    if (kind === "impact") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (kind === "warn") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const score = async (side: "a" | "b") => {
    if (busy || match.status === "completed") return;
    setBusy(true);
    hap("impact");
    try {
      const m = await api.scorePoint(id!, side);
      setMatch(m);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    hap("warn");
    try {
      const m = await api.undoPoint(id!);
      setMatch(m);
    } catch (e: any) {} finally { setBusy(false); }
  };

  const finish = async () => {
    if (busy) return;
    const confirm = (callback: () => void) => {
      if (Platform.OS === "web") { if (window.confirm("Finish this match?")) callback(); return; }
      Alert.alert("Finish match?", "This will mark the match completed and update standings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Finish", style: "destructive", onPress: callback },
      ]);
    };
    confirm(async () => {
      setBusy(true);
      hap("success");
      try {
        const m = await api.finishMatch(id!);
        setMatch(m);
        setTimeout(() => router.back(), 800);
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Failed");
      } finally { setBusy(false); }
    });
  };

  const completed = match.status === "completed";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top", "bottom"]}>
      {/* Top mini bar */}
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={28} color={theme.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>COURT {match.court_number}</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, marginTop: 2 }}>Target: {match.target_score}</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Team A block */}
      <Pressable
        testID="score-a-btn"
        disabled={completed}
        onPress={() => score("a")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.surfaceSecondary, borderColor: theme.brand, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM A</Text>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }} numberOfLines={1}>{match.team_a_name}</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }} numberOfLines={1}>
            {match.team_a_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-a-value" style={{ color: theme.onSurface, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>
          {match.score_a}
        </Text>
        {!completed && (
          <View style={{ position: "absolute", bottom: spacing.md, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={20} color={theme.brand} />
            <Text style={{ color: theme.brand, fontWeight: "900", letterSpacing: 1 }}>TAP +1</Text>
          </View>
        )}
      </Pressable>

      {/* Action bar */}
      <View style={[styles.actions, { borderColor: theme.border }]}>
        <Pressable testID="undo-btn" onPress={undo} disabled={completed} style={[styles.actionBtn, { backgroundColor: theme.surfaceTertiary, opacity: completed ? 0.4 : 1 }]}>
          <Ionicons name="arrow-undo" size={20} color={theme.onSurface} />
          <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: fontSize.sm }}>UNDO</Text>
        </Pressable>
        <Pressable testID="finish-btn" onPress={finish} style={[styles.actionBtn, { backgroundColor: completed ? theme.success : theme.error, flex: 2 }]}>
          <Ionicons name={completed ? "trophy" : "flag"} size={20} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: fontSize.base }}>
            {completed ? "MATCH COMPLETED" : "FINISH MATCH"}
          </Text>
        </Pressable>
      </View>

      {/* Team B block */}
      <Pressable
        testID="score-b-btn"
        disabled={completed}
        onPress={() => score("b")}
        style={({ pressed }) => [styles.scoreBlock, { backgroundColor: theme.brandTertiary, borderColor: theme.brand, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={{ position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg }}>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 2 }}>TEAM B</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xl, fontWeight: "900" }} numberOfLines={1}>{match.team_b_name}</Text>
          <Text style={{ color: theme.onBrandTertiary, fontSize: fontSize.xs, opacity: 0.7 }} numberOfLines={1}>
            {match.team_b_players?.map((p: any) => p.name).join(" · ") || "—"}
          </Text>
        </View>
        <Text testID="score-b-value" style={{ color: theme.onBrandTertiary, fontSize: fontSize.score, fontWeight: "900", lineHeight: fontSize.score }}>
          {match.score_b}
        </Text>
        {!completed && (
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
