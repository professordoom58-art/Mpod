/**
 * App root.
 *
 * GestureHandlerRootView must wrap everything that uses gestures.
 * SafeAreaProvider supplies insets; the body is sized from the safe width.
 */

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body } from './src/ui/Body';
import { colors } from './src/ui/theme';

const SHOW_DEBUG = false;

function AppInner() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const availableHeight = Math.max(0, height - insets.top - insets.bottom);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
        <StatusBar style="dark" />
        <AppInner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
