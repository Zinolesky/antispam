/**
 * App.tsx — Root component.
 * Initializes SQLite, restores auth session, and starts the sync scheduler.
 */
import React, { useEffect, useRef } from 'react';
import { StatusBar, View, ActivityIndicator, Text, StyleSheet, Linking } from 'react-native';
import { initDB, syncBlockListsWithCloud } from './src/services/DatabaseService';
import { startSyncScheduler } from './src/services/SyncService';
import { useAppStore } from './src/store/useAppStore';
import { storeTokens, AuthAPI } from './src/services/ApiService';
import AppNavigator from './src/navigation/AppNavigator';
import { StitchAlertProvider } from './src/components/StitchAlert';

export default function App() {
  const { restoreSession, authLoading } = useAppStore();
  const stopSync = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event.url;
      if (!url || !url.startsWith('antispam://auth')) return;
      try {
        const query = url.split('?')[1];
        if (!query) return;
        const params: Record<string, string> = {};
        query.split('&').forEach(part => {
          const [key, ...vals] = part.split('=');
          if (key) params[decodeURIComponent(key)] = decodeURIComponent(vals.join('='));
        });
        const access = params.access_token;
        const refresh = params.refresh_token;
        if (access && refresh) {
          await storeTokens(access, refresh);
          const me = await AuthAPI.me();
          useAppStore.setState({ isAuthenticated: true, user: me.data });
          syncBlockListsWithCloud().catch(() => {});
        }
      } catch (err) {
        console.error('[App] Failed to handle OAuth redirect:', err);
      }
    };

    const linkSub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });

    async function bootstrap() {
      try {
        await initDB();
        await restoreSession();
        // Start delta sync scheduler (returns cleanup fn)
        stopSync.current = startSyncScheduler();
      } catch (err) {
        console.error('[App] Bootstrap error:', err);
      }
    }

    bootstrap();

    return () => {
      stopSync.current?.();
      linkSub.remove();
    };
  }, [restoreSession]);

  if (authLoading) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D1A" />
        <Text style={styles.splashIcon}>🛡️</Text>
        <Text style={styles.splashTitle}>AntiSpamApp</Text>
        <ActivityIndicator color="#7C6FF7" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <StitchAlertProvider>
      <AppNavigator />
    </StitchAlertProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0D0D1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashIcon: { fontSize: 64, marginBottom: 16 },
  splashTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
});
