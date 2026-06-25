// Admin home — Teams roster + Matches CRUD with quick scheduling
import { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/ThemeContext";
import { api, clearAuth, getUser } from "@/src/api";
import { useLive } from "@/src/useLive";
import { fontSize, radius, spacing } from "@/src/theme";
import { Badge, Btn, Card, EmptyState, Input, Loader, Sub, statusColor } from "@/src/ui";

type Tab = "matches" | "teams" | "referees";

export default function AdminHome() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("matches");
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [refs, setRefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showRefModal, setShowRefModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, m, r] = await Promise.all([api.listTeams(), api.listMatches(), api.listReferees().catch(() => [])]);
      setTeams(t); setMatches(m); setRefs(r as any[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getUser().then((u) => { if (!u || u.role !== "admin") router.replace("/login"); });
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
        {(["matches", "teams", "referees"] as Tab[]).map((k) => {
          const active = tab === k;
          return (
            <Pressable key={k} testID={`admin-tab-${k}`} onPress={() => setTab(k)}
              style={{ flexShrink: 0, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill,
                backgroundColor: active ? theme.brand : "transparent", borderWidth: 1, borderColor: active ? theme.brand : theme.border }}>
              <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", lineHeight: 34 }}>{k}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === "matches" && (
        <MatchesTab matches={matches} teams={teams} onChange={load} />
      )}
      {tab === "teams" && <TeamsTab teams={teams} />}
      {tab === "referees" && <RefereesTab refs={refs} onChange={load} showModal={showRefModal} setShowModal={setShowRefModal} />}

      {tab === "matches" && (
        <Pressable testID="create-match-fab" onPress={() => setShowCreate(true)}
          style={[styles.fab, { backgroundColor: theme.brand }]}>
          <Ionicons name="add" size={28} color={theme.onBrand} />
        </Pressable>
      )}

      <CreateMatchModal visible={showCreate} onClose={() => setShowCreate(false)} teams={teams} onCreated={load} />
    </SafeAreaView>
  );
}

function MatchesTab({ matches, teams, onChange }: { matches: any[]; teams: any[]; onChange: () => void }) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState<any>(null);

  const del = async (id: string) => {
    if (Platform.OS === "web" && !window.confirm("Delete this match?")) return;
    await api.deleteMatch(id); onChange();
  };

  return (
    <>
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.sm }}
        ListEmptyComponent={<EmptyState icon="calendar-outline" title="No matches yet" subtitle="Tap + to schedule the first match" />}
        renderItem={({ item }) => {
          const sc = statusColor(item.status, theme);
          const ready = (item.team_a_player_ids?.length || 0) === 2 && (item.team_b_player_ids?.length || 0) === 2;
          return (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "800", letterSpacing: 1 }}>COURT {item.court_number}</Text>
                <Badge label={item.status === "live" ? "● LIVE" : item.status} color={sc} />
              </View>
              <Text style={{ color: theme.onSurface, fontWeight: "900", fontSize: fontSize.lg }}>{item.team_a_name}  vs  {item.team_b_name}</Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm, marginTop: 4 }}>Score: {item.score_a} – {item.score_b} • Target {item.target_score}</Text>
              {!ready && <Text style={{ color: theme.warning, fontSize: fontSize.xs, marginTop: 4 }}>⚠ Assign 2 players per team to start</Text>}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Btn small title="Edit / Assign" icon="create-outline" variant="secondary" testID={`edit-match-${item.id}`} onPress={() => setEditing(item)} />
                {item.status === "completed" ? null : (
                  <Btn small title={item.status === "live" ? "Live" : "Start"} icon="play" variant={item.status === "live" ? "ghost" : "primary"} testID={`start-match-${item.id}`}
                    onPress={async () => { await api.startMatch(item.id); onChange(); }} disabled={!ready} />
                )}
                <Btn small title="" icon="trash" variant="danger" testID={`delete-match-${item.id}`} onPress={() => del(item.id)} />
              </View>
            </Card>
          );
        }}
      />
      <EditMatchModal match={editing} teams={teams} onClose={() => setEditing(null)} onSaved={onChange} />
    </>
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
    try {
      await api.createReferee({ name, pin });
      setName(""); setPin(""); setShowModal(false); onChange();
    } catch (e: any) { setErr(e?.message || "Failed"); }
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

function CreateMatchModal({ visible, onClose, teams, onCreated }: any) {
  const { theme } = useTheme();
  const [court, setCourt] = useState("1");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [target, setTarget] = useState("11");
  const [err, setErr] = useState("");

  useEffect(() => { if (visible) { setCourt("1"); setAId(""); setBId(""); setTarget("11"); setErr(""); } }, [visible]);

  const create = async () => {
    setErr("");
    try {
      await api.createMatch({
        team_a_id: aId, team_b_id: bId,
        court_number: parseInt(court) || 1,
        target_score: parseInt(target) || 11,
        team_a_player_ids: [], team_b_player_ids: [],
      });
      onCreated(); onClose();
    } catch (e: any) { setErr(e?.message || "Failed"); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.modal, { backgroundColor: theme.surfaceSecondary, maxHeight: 560 }]}>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", marginBottom: spacing.md }}>New Match</Text>
            <Sub>Court Number</Sub>
            <Input value={court} onChangeText={setCourt} placeholder="1" keyboardType="number-pad" testID="court-input" />
            <View style={{ height: spacing.md }} />
            <Sub>Team A</Sub>
            <TeamPicker teams={teams} selected={aId} exclude={bId} onPick={setAId} testIDPrefix="team-a" />
            <View style={{ height: spacing.md }} />
            <Sub>Team B</Sub>
            <TeamPicker teams={teams} selected={bId} exclude={aId} onPick={setBId} testIDPrefix="team-b" />
            <View style={{ height: spacing.md }} />
            <Sub>Target Score</Sub>
            <Input value={target} onChangeText={setTarget} placeholder="11" keyboardType="number-pad" testID="target-input" />
            {err ? <Text style={{ color: theme.error, marginTop: spacing.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Btn title="Cancel" variant="ghost" onPress={onClose} testID="cancel-create-match" />
              <Btn title="Create" variant="primary" onPress={create} disabled={!aId || !bId} testID="confirm-create-match" />
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

function EditMatchModal({ match, teams, onClose, onSaved }: any) {
  const { theme } = useTheme();
  const [aPlayers, setAPlayers] = useState<string[]>([]);
  const [bPlayers, setBPlayers] = useState<string[]>([]);
  const [court, setCourt] = useState("1");
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");

  useEffect(() => {
    if (match) {
      setAPlayers(match.team_a_player_ids || []);
      setBPlayers(match.team_b_player_ids || []);
      setCourt(String(match.court_number));
      setScoreA(String(match.score_a));
      setScoreB(String(match.score_b));
    }
  }, [match]);

  if (!match) return null;
  const teamA = teams.find((t: any) => t.id === match.team_a_id);
  const teamB = teams.find((t: any) => t.id === match.team_b_id);

  const togglePlayer = (list: string[], setList: any, id: string) => {
    if (list.includes(id)) setList(list.filter((x) => x !== id));
    else if (list.length < 2) setList([...list, id]);
  };

  const save = async () => {
    await api.updateMatch(match.id, {
      court_number: parseInt(court) || 1,
      team_a_player_ids: aPlayers, team_b_player_ids: bPlayers,
      score_a: parseInt(scoreA) || 0, score_b: parseInt(scoreB) || 0,
    });
    onSaved(); onClose();
  };

  return (
    <Modal visible transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.modalBg, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.modal, { backgroundColor: theme.surfaceSecondary }]}>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xl, fontWeight: "900", marginBottom: spacing.sm }}>Edit Match</Text>
            <Sub>Court</Sub>
            <Input value={court} onChangeText={setCourt} keyboardType="number-pad" testID="edit-court-input" />
            <View style={{ height: spacing.md }} />
            <Text style={{ color: theme.brand, fontWeight: "900" }}>{teamA?.name} — pick 2 players</Text>
            {teamA?.players?.map((p: any) => {
              const on = aPlayers.includes(p.id);
              return (
                <Pressable key={p.id} testID={`pa-${p.id}`} onPress={() => togglePlayer(aPlayers, setAPlayers, p.id)}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 }}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? theme.brand : theme.onSurfaceSecondary} />
                  <Text style={{ color: theme.onSurface, fontWeight: p.is_captain ? "900" : "600" }}>{p.is_captain ? "★ " : ""}{p.name}</Text>
                </Pressable>
              );
            })}
            <View style={{ height: spacing.md }} />
            <Text style={{ color: theme.brand, fontWeight: "900" }}>{teamB?.name} — pick 2 players</Text>
            {teamB?.players?.map((p: any) => {
              const on = bPlayers.includes(p.id);
              return (
                <Pressable key={p.id} testID={`pb-${p.id}`} onPress={() => togglePlayer(bPlayers, setBPlayers, p.id)}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 }}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? theme.brand : theme.onSurfaceSecondary} />
                  <Text style={{ color: theme.onSurface, fontWeight: p.is_captain ? "900" : "600" }}>{p.is_captain ? "★ " : ""}{p.name}</Text>
                </Pressable>
              );
            })}
            <View style={{ height: spacing.md }} />
            <Sub>Score override (use only to fix mistakes)</Sub>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
              <Input value={scoreA} onChangeText={setScoreA} keyboardType="number-pad" testID="edit-score-a" style={{ flex: 1 }} />
              <Input value={scoreB} onChangeText={setScoreB} keyboardType="number-pad" testID="edit-score-b" style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Btn title="Cancel" variant="ghost" onPress={onClose} testID="cancel-edit-match" />
              <Btn title="Save" variant="primary" onPress={save} testID="save-edit-match" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: spacing.lg, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6 },
  modalBg: { flex: 1, alignItems: "center", justifyContent: "center" },
  modal: { width: "92%", maxWidth: 480, borderRadius: radius.lg, padding: spacing.lg },
});
