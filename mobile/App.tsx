import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors } from './src/theme';
import * as api from './src/api/client';

// ── BUILD MARKER ──────────────────────────────────────────────────────────────
// Bump this string on every JS change. It logs the instant the bundle loads.
// If you do NOT see this exact line after reloading, the device is running a
// STALE bundle (old embedded APK bundle, because it couldn't reach Metro).
export const BUILD_MARKER = 'ISLC-JS-BUILD v4 · insecure-only-connect · 2026-08-05';
console.log(`\n██████████ ${BUILD_MARKER} ██████████\n`);

export type RootStackParamList = {
  Connect: undefined;
  Dashboard: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.nightEnd,
    card: colors.nightStart,
    text: colors.white,
    border: colors.cardBorder,
    primary: colors.amber,
  },
};

export default function App() {
  // Warm up the stored auth token as early as possible.
  useEffect(() => {
    api.loadToken();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.nightStart },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: colors.nightEnd },
          }}
        >
          <Stack.Screen
            name="Connect"
            component={ConnectScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: 'Live Control' }}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'Sign in', presentation: 'modal' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
