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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

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
  const shellGradient = appTheme.shellGradient;

  return (
    <View style={[styles.root, { backgroundColor: appTheme.shellColor }]}>
      {shellGradient ? (
        /*
         * Themed chassis finish. Painted across the WHOLE viewport (behind the
         * safe-area bands too), so an anodized shell has no flat seam at the
         * notch or the home indicator. Body goes transparent while this is up.
         */
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="appShell" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={shellGradient[0]} />
                <Stop offset="1" stopColor={shellGradient[1]} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#appShell)" />
          </Svg>
        </View>
      ) : null}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: shellGradient ? 'transparent' : appTheme.shellColor,
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
  /** Safe-area padded layer; transparent so the shell gradient shows through. */
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
