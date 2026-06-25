// Shared lightweight UI primitives
import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/ThemeContext";
import { spacing, radius, fontSize, font } from "@/src/theme";

export function Btn({
  title,
  onPress,
  variant = "primary",
  icon,
  testID,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}) {
  const { theme } = useTheme();
  const bg =
    variant === "primary" ? theme.brand :
    variant === "secondary" ? theme.surfaceTertiary :
    variant === "danger" ? theme.error :
    "transparent";
  const fg =
    variant === "primary" ? theme.onBrand :
    variant === "secondary" ? theme.onSurfaceTertiary :
    variant === "danger" ? "#FFFFFF" :
    theme.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          paddingVertical: small ? spacing.sm : spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          minHeight: small ? 36 : 48,
        },
        variant === "ghost" && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
      <Text style={{ color: fg, fontSize: small ? fontSize.sm : fontSize.lg, fontWeight: "700", letterSpacing: 0.3 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const { theme } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: theme.surfaceSecondary,
          borderRadius: radius.lg,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({ label, color, testID }: { label: string; color: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: color + "22",
        borderColor: color,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color, fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

export function Heading({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text style={[{ color: theme.onSurface, fontSize: fontSize.xxl, fontWeight: "900", letterSpacing: 0.5 }, style]}>
      {children}
    </Text>
  );
}

export function Sub({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text style={[{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm }, style]}>{children}</Text>
  );
}

export function Loader() {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
      <ActivityIndicator color={theme.brand} size="large" />
    </View>
  );
}

export function EmptyState({ icon = "information-circle-outline", title, subtitle }: { icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm }}>
      <Ionicons name={icon} size={48} color={theme.onSurfaceSecondary} />
      <Text style={{ color: theme.onSurface, fontSize: fontSize.lg, fontWeight: "700" }}>{title}</Text>
      {subtitle && <Text style={{ color: theme.onSurfaceSecondary, fontSize: fontSize.sm, textAlign: "center" }}>{subtitle}</Text>}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  testID,
  secureTextEntry,
  keyboardType,
  maxLength,
  style,
}: any) {
  const { theme } = useTheme();
  const { TextInput } = require("react-native");
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.onSurfaceSecondary}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize="none"
      style={[
        {
          backgroundColor: theme.surfaceSecondary,
          color: theme.onSurface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          fontSize: fontSize.lg,
          minHeight: 48,
        },
        style,
      ]}
    />
  );
}

export function statusColor(status: string, theme: any) {
  if (status === "live") return theme.error;
  if (status === "completed") return theme.success;
  return theme.onSurfaceSecondary;
}
