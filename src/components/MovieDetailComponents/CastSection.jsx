import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useThemeContext } from '@context/ThemeContext';

export default function CastSection({ cast }) {
  const { colors } = useThemeContext();

  if (!cast || cast.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Oyuncular
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {cast.map((actor, index) => (
          <View
            key={index}
            style={[
              styles.castCard,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.border }]}>
              <Ionicons name="person" size={24} color={colors.textSecondary} />
            </View>
            <Text
              style={[styles.actorName, { color: colors.text }]}
              numberOfLines={2}
            >
              {actor}
            </Text>
          </View>
        ))}
      </ScrollView>
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
  scrollContent: {
    gap: 12,
    paddingRight: 20,
  },
  castCard: {
    width: 100,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actorName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
