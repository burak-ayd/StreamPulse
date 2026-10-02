import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import TVPressable from '@components/common/TVPressable';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useThemeContext } from '@context/ThemeContext';

const { height } = Dimensions.get('window');

export default function ErrorState({ error, onRetry }) {
  const { colors } = useThemeContext();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Ionicons name="alert-circle-outline" size={64} color={colors.textSecondary} />
      
      <Text style={[styles.title, { color: colors.text }]}>
        Bir Hata Oluştu
      </Text>
      
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {error || 'İçerik yüklenirken bir sorun oluştu'}
      </Text>

      {onRetry && (
        <TVPressable
          autoFocus={true}
          style={({ focused }) => [
            styles.retryButton,
            { backgroundColor: colors.primary },
            focused && styles.retryButtonFocused,
          ]}
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TVPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  retryButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.05 }],
  },
});
