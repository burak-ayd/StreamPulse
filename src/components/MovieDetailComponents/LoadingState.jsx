import React from 'react';
import { View, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { useThemeContext } from '@context/ThemeContext';

const { height } = Dimensions.get('window');

export default function LoadingState() {
  const { colors } = useThemeContext();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height,
  },
});
