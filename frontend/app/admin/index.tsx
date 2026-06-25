// Admin home — Fixtures (create, list) + Teams roster + Referees
import { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/ThemeContext";
import { api, clearAuth, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Btn, Card, EmptyState, Input, Loader, Sub } from "@/src/ui";

type Tab = "fixtures" | "teams" | "referees";

export default function AdminHome() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("fixtures");
  const [teams, setTeams] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [refs, setRefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showRefModal, setShowRefModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, f, r] = await Promise.all([
        api.listTeams(),
        api.listFixtures(),
        api.listReferees().catch(() => [] as any[]),
      ]);
      setTeams(t); setFixtures(f); setRefs(r as any[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getUser().then((u) => { if (!u || (u.role !== "admin" && u.role !== "referee")) router.replace("/login"); });
    load();
  }, [load]);
  useLive(() => load());

  const logout = async () => { await clearAuth(); router.replace("/"); };

  if (loading) return <Loader />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.brand, fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 2 }}>ADMIN</Text>
          <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }}>Tournament Control</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Pressable testID="view-public-btn" onPress={() => router.push("/")} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
            <Ionicons name="eye-outline" size={20} color={theme.onSurface} />
          </Pressable>
          <Pressable testID="logout-btn" onPress={logout} hitSlop={8} style={[styles.iconBtn, { borderColor: theme.border }]}>
            <Ionicons name="log-out-outline" size={20} color={theme.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, height: 56, alignItems: "center" }}
        style={{ height: 56, maxHeight: 56, borderBottomWidth: 1, borderBottomColor: theme.border }}
      >
        {(["fixtures", "teams", "referees"] as Tab[]).map((k) => {
          const active = tab === k;
          return (
            <Pressable key={k} testID={`admin-tab-${k}`} onPress={() => setTab(k)}
              style={{ flexShrink: 0, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill,
                backgroundColor: active ? theme.brand : "transparent", borderWidth: 1, borderColor: active ? theme.brand : theme.border }}>
              <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", lineHeight: 34 }}>{k}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === "fixtures" && (
        <FixturesTab fixtures={fixtures} onChange={load} />
      )}
      {tab === "teams" && <TeamsTab teams={teams} />}
      {tab === "referees" && <RefereesTab refs={refs} onChange={load} showModal={showRefModal} setShowModal={setShowRefModal} />}

      {tab === "fixtures" && (
        <Pressable testID="create-fixture-fab" onPress={() => setShowCreate(true)}
          style={[styles.fab, { backgroundColor: theme.brand }]}>
          <Ionicons name="add" size={28} color={theme.onBrand} />
        </Pressable>
      )}

      <CreateFixtureModal visible={showCreate} onClose={() => setShowCreate(false)} teams={teams} onCreated={load} />
    </SafeAreaView>
  );
}

function FixturesTab({ fixtures, onChange }: { fixtures: any[]; onChange: () => void }) {
  const { theme } = useTheme();
  const del = async (id: string) => {
    if (Platform.OS === "web" && !window.confirm("Delete this fixture and all 12 matches?")) return;
    await api.deleteFixture(id); onChange();
  };

  return (
    <FlatList
      data={fixtures}
      keyExtractor={(f) => f.id}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
      ListEmptyComponent={<EmptyState icon="calendar-outline" title="No fixtures yet" subtitle="Tap + to schedule a fixture (12 matches will auto-create)" />}
      renderItem={({ item }) => (
        <View>
          <Pressable testID={`admin-fixture-${item.id}`} onPress={() => router.push(`/fixture/${item.id}`)}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "800", letterSpacing: 1 }}>COURT {item.court_number} · {item.matches_completed}/{item.matches_total}</Text>
                <Badge label={item.status === "live" ? "● LIVE" : item.status.toUpperCase()} color={item.status === "live" ? theme.error : item.status === "completed" ? theme.success : theme.onSurfaceSecondary} />
              </View>
              <Text style={{ color: theme.onSurface, fontWeight: "900", fontSize: fontSize.lg }} numberOfLines={1}>{item.team_a_name}</Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, marginVertical: 2 }}>vs</Text>
              <Text style={{ color: theme.onSurface, fontWeight: "900", fontSize: fontSize.lg }} numberOfLines={1}>{item.team_b_name}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm }}>
                <Text style={{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "900" }}>{item.total_a} – {item.total_b}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Btn small title="Manage" icon="construct" variant="secondary" testID={`manage-fixture-${item.id}`}
                    onPress={() => router.push(`/fixture/${item.id}`)} />
                  <Btn small title="" icon="trash" variant="danger" testID={`delete-fixture-${item.id}`} onPress={() => del(item.id)} />
                </View>
              </View>
            </Card>
          </Pressable>
        </View>
      )}
    />
  );
}

function TeamsTab({ teams }: { teams: any[] }) {
  const { theme } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
      {teams.map((t) => (
        <Card key={t.id} testID={`team-${t.id}`}>
          <Text style={{ color: theme.brand, fontWeight: "900", fontSize: fontSize.lg, letterSpacing: 1 }}>{t.name}</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, marginBottom: spacing.sm }}>Captain: {t.captain_name}</Text>
          {t.players?.map((p: any) => (
            <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
              <Text style={{ color: theme.onSurface, fontSize: fontSize.sm, fontWeight: p.is_captain ? "900" : "600" }}>
                {p.is_captain ? "★ " : "  "}{p.name}
              </Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs }}>{p.category}</Text>
            </View>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}

function RefereesTab({ refs, onChange, showModal, setShowModal }: any) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const create = async () => {
    setErr("");
    try { await api.createReferee({ name, pin }); setName(""); setPin(""); setShowModal(false); onChange(); }
    catch (e: any) { setErr(e?.message || "Failed"); }
  };
  const del = async (id: string) => {
    if (Platform.OS === "web" && !window.confirm("Remove referee?")) return;
    await api.deleteReferee(id); onChange();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}>
      <Btn title="Add Referee" icon="person-add" variant="primary" testID="add-ref-btn" onPress={() => setShowModal(true)} />
      {refs.length === 0 ? (
        <Sub>No referees yet.</Sub>
      ) : refs.map((r: any) => (
        <Card key={r.id} testID={`ref-${r.id}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: fontSize.lg }}>{r.name}</Text>
              <Sub>Role: referee</Sub>
            </View>
            <Btn small title="" icon="trash" variant="danger" onPress={() => del(r.id)} testID={`del-ref-${r.id}`} />
          </View>
        </Card>
      ))}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
          <View style={[styles.modal, { backgroundColor: theme.surfaceSecondary }]}>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", marginBottom: spacing.md }}>New Referee</Text>
            <Input testID="ref-name-input" value={name} onChangeText={setName} placeholder="Name" />
            <View style={{ height: spacing.sm }} />
            <Input testID="ref-pin-input" value={pin} onChangeText={(v: string) => setPin(v.replace(/\D/g, ""))} placeholder="4-digit PIN" keyboardType="number-pad" maxLength={4} />
            {err ? <Text style={{ color: theme.error, marginTop: spacing.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Btn title="Cancel" variant="ghost" onPress={() => setShowModal(false)} testID="cancel-ref-btn" />
              <Btn title="Create" variant="primary" onPress={create} testID="save-ref-btn" disabled={!name || pin.length !== 4} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function CreateFixtureModal({ visible, onClose, teams, onCreated }: any) {
  const { theme } = useTheme();
  const [court, setCourt] = useState("1");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [target, setTarget] = useState("11");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setCourt("1"); setAId(""); setBId(""); setTarget("11"); setErr(""); } }, [visible]);

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const f = await api.createFixture({
        team_a_id: aId, team_b_id: bId,
        court_number: parseInt(court) || 1,
        target_score: parseInt(target) || 11,
      });
      onCreated(); onClose();
      router.push(`/fixture/${f.id}`);
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.modal, { backgroundColor: theme.surfaceSecondary, maxHeight: 600 }]}>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900" }}>New Fixture</Text>
            <Sub>Creates 4 rounds × 3 matches = 12 matches. Assign players from the fixture page.</Sub>
            <View style={{ height: spacing.md }} />
            <Sub>Court Number</Sub>
            <Input value={court} onChangeText={setCourt} placeholder="1" keyboardType="number-pad" testID="court-input" />
            <View style={{ height: spacing.md }} />
            <Sub>Team A</Sub>
            <TeamPicker teams={teams} selected={aId} exclude={bId} onPick={setAId} testIDPrefix="team-a" />
            <View style={{ height: spacing.md }} />
            <Sub>Team B</Sub>
            <TeamPicker teams={teams} selected={bId} exclude={aId} onPick={setBId} testIDPrefix="team-b" />
            <View style={{ height: spacing.md }} />
            <Sub>Target Score per match</Sub>
            <Input value={target} onChangeText={setTarget} placeholder="11" keyboardType="number-pad" testID="target-input" />
            {err ? <Text style={{ color: theme.error, marginTop: spacing.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Btn title="Cancel" variant="ghost" onPress={onClose} testID="cancel-create-fixture" />
              <Btn title={busy ? "..." : "Create"} variant="primary" onPress={create} disabled={busy || !aId || !bId} testID="confirm-create-fixture" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TeamPicker({ teams, selected, exclude, onPick, testIDPrefix }: any) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {teams.filter((t: any) => t.id !== exclude).map((t: any) => {
        const active = selected === t.id;
        return (
          <Pressable key={t.id} testID={`${testIDPrefix}-${t.id}`} onPress={() => onPick(t.id)}
            style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
              backgroundColor: active ? theme.brand : "transparent", borderWidth: 1, borderColor: active ? theme.brand : theme.border }}>
            <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "800", fontSize: fontSize.sm }}>{t.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: spacing.lg, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6 },
  modalBg: { flex: 1, alignItems: "center", justifyContent: "center" },
  modal: { width: "92%", maxWidth: 480, borderRadius: radius.lg, padding: spacing.lg },
});
