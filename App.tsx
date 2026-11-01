/**
 * App root.
 *
 * GestureHandlerRootView must wrap everything that uses gestures.
 * SafeAreaProvider supplies insets; the body is sized from the safe width.
 *
 * The root paints the active theme's shell color, so the safe-area bands match
 * the chassis instead of staying silver under a dark case, and the status bar
 * flips to light ink on dark shells. Settings changes propagate through the
 * library store, so a theme switch repaints the whole app without a relaunch.
 */

import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body } from './src/ui/Body';
import { isDarkHex, resolveAppTheme } from './src/ui/theme';
import { useLibraryStore } from './src/library/store';
import { pushNowPlaying } from './src/nav/menus';
import { setNowPlayingHandler } from './src/player/store';

const SHOW_DEBUG = false;

function AppInner() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Active theme: the shell color fills the safe-area bands behind Body.
  const settings = useLibraryStore((s) => s.settings);
  const appTheme = resolveAppTheme(settings?.themeId, settings?.customTheme);

  // The player store pushes Now Playing frames through this handler.
  useEffect(() => {
    setNowPlayingHandler(pushNowPlaying);
    return () => setNowPlayingHandler(null);
  }, []);

  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const availableHeight = Math.max(0, height - insets.top - insets.bottom);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: appTheme.shellColor,
        },
      ]}
    >
      <StatusBar style={isDarkHex(appTheme.shellColor) ? 'light' : 'dark'} />
      <Body
        availableWidth={availableWidth}
        availableHeight={availableHeight}
        showDebug={SHOW_DEBUG}
      />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
