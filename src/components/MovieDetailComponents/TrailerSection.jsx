import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@context/ThemeContext';
import * as WebBrowser from 'expo-web-browser';

export default function TrailerSection({ trailerUrl }) {
  const { colors } = useThemeContext();

  if (!trailerUrl) return null;

  const handleOpenTrailer = async () => {
    try {
      await WebBrowser.openBrowserAsync(trailerUrl);
    } catch (error) {
      console.error('Error opening trailer:', error);
      // Fallback to Linking
      Linking.openURL(trailerUrl);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Fragman
      </Text>

      <TouchableOpacity
        style={[
          styles.trailerButton,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
          },
        ]}
        onPress={handleOpenTrailer}
        activeOpacity={0.8}
      >
        <View style={[styles.playIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="play" size={24} color="#ffffff" />
        </View>
        <View style={styles.trailerInfo}>
          <Text style={[styles.trailerTitle, { color: colors.text }]}>
            Fragmanı İzle
          </Text>
          <Text style={[styles.trailerSubtitle, { color: colors.textSecondary }]}>
            YouTube'da aç
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  playIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailerInfo: {
    flex: 1,
  },
  trailerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  trailerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
});
