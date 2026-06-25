// Login screen — toggle between Admin email/password and Referee PIN
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/src/ThemeContext";
import { fontSize, radius, spacing } from "@/src/theme";
import { Btn, Input } from "@/src/ui";
import { adminLogin, refereeLogin } from "@/src/api";

type Mode = "admin" | "referee";

export default function Login() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onAdmin = async () => {
    setErr(""); setBusy(true);
    try {
      await adminLogin(email.trim(), password);
      router.replace("/admin");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };
  const onReferee = async () => {
    setErr(""); setBusy(true);
    try {
      await refereeLogin(pin);
      router.replace("/referee");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Pressable testID="back-btn" onPress={() => router.back()} hitSlop={8} style={{ alignSelf: "flex-start", padding: spacing.sm }}>
            <Ionicons name="chevron-back" size={26} color={theme.onSurface} />
          </Pressable>

          <View style={{ alignItems: "center", marginVertical: spacing.lg }}>
            <View style={{ width: 64, height: 64, backgroundColor: theme.brand, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="tennisball" size={36} color={theme.onBrand} />
            </View>
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "900", letterSpacing: 1, marginTop: spacing.md }}>SIGN IN</Text>
            <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm, marginTop: 4 }}>Admins and Referees only</Text>
          </View>

          {/* Mode toggle */}
          <View style={{ flexDirection: "row", backgroundColor: theme.surfaceTertiary, borderRadius: radius.md, padding: 4 }}>
            {(["admin", "referee"] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  testID={`mode-${m}`}
                  onPress={() => { setMode(m); setErr(""); }}
                  style={{ flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, backgroundColor: active ? theme.brand : "transparent" }}
                >
                  <Text style={{ color: active ? theme.onBrand : theme.onSurface, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>{m}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === "admin" ? (
            <View style={{ gap: spacing.md }}>
              <View>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Email</Text>
                <Input testID="email-input" value={email} onChangeText={setEmail} placeholder="shanaygala@gmail.com" keyboardType="email-address" />
              </View>
              <View>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Password</Text>
                <Input testID="password-input" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
              </View>
              {err ? <Text style={{ color: theme.error, fontSize: fontSize.sm }}>{err}</Text> : null}
              <Btn title={busy ? "Signing in..." : "Sign In as Admin"} onPress={onAdmin} disabled={busy || !email || !password} icon="log-in" testID="admin-submit-btn" />
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary, textAlign: "center" }]}>Enter 4-digit Referee PIN</Text>
              <PinInput value={pin} onChange={setPin} />
              {err ? <Text style={{ color: theme.error, fontSize: fontSize.sm, textAlign: "center" }}>{err}</Text> : null}
              <Btn title={busy ? "Verifying..." : "Continue as Referee"} onPress={onReferee} disabled={busy || pin.length !== 4} icon="flag" testID="referee-submit-btn" />
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.xs, textAlign: "center" }}>Default referee PIN: 1234</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 56, height: 64, borderRadius: radius.md, borderWidth: 2,
              borderColor: value.length === i ? theme.brand : theme.border,
              backgroundColor: theme.surfaceSecondary,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xxxl, fontWeight: "900" }}>
              {value[i] ? "●" : ""}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: 264, gap: spacing.sm, marginTop: spacing.md }}>
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, idx) => (
          <Pressable
            key={idx}
            testID={`pin-${k || "blank"}`}
            disabled={!k}
            onPress={() => {
              if (k === "⌫") onChange(value.slice(0, -1));
              else if (k && value.length < 4) onChange(value + k);
            }}
            style={{
              width: 80, height: 64, borderRadius: radius.md,
              backgroundColor: k ? theme.surfaceSecondary : "transparent",
              borderWidth: k ? 1 : 0, borderColor: theme.border,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "800" }}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.xs },
});
