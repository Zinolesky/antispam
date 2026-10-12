/**
 * AppNavigator — bottom tab navigator with all main screens.
 * Tab bar replicates the Stitch "BottomNavBar" shared component.
 */
import React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '@screens/HomeScreen';
import SpamLogsScreen from '@screens/SpamLogsScreen';
import ReportScreen from '@screens/ReportScreen';
import SettingsScreen from '@screens/SettingsScreen';
import { Symbol } from '../components/stitch';
import { a, c, t } from '../theme/stitch';

export type RootTabParamList = {
  Home: undefined;
  SpamLogs: undefined;
  Report: { prefillNumber?: string };
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TABS: Record<string, { icon: string; label: string }> = {
  Home: { icon: 'security', label: 'Shield' },
  SpamLogs: { icon: 'list_alt', label: 'Logs' },
  Report: { icon: 'gpp_maybe', label: 'Report' },
  Settings: { icon: 'tune', label: 'Settings' },
};

function StitchTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: 8 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = TABS[route.name];
        const color = focused ? c.primary : c.outline;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={`${tab.label} tab`}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={({ pressed }) => [
              styles.item,
              focused && styles.itemActive,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}>
            <Symbol name={tab.icon} size={24} color={color} filled={focused && route.name !== 'Settings'} />
            <Text style={[t.labelCaption, styles.label, { color }, focused && { fontFamily: 'Manrope-Bold' }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={props => <StitchTabBar {...props} />}
        screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Shield' }} />
        <Tab.Screen name="SpamLogs" component={SpamLogsScreen} options={{ title: 'Logs' }} />
        <Tab.Screen name="Report" component={ReportScreen} options={{ title: 'Report' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: a(c.surfaceContainerLow, 0.96),
    borderTopWidth: 1,
    borderTopColor: a(c.outlineVariant, 0.3),
    elevation: 16,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  itemActive: { backgroundColor: a(c.surfaceContainerHighest, 0.5) },
  label: { marginTop: 2 },
});
