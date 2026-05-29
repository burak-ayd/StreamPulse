import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeContext } from '@context/ThemeContext';

export default function OverviewSection({ content }) {
  const { colors } = useThemeContext();
  const [expanded, setExpanded] = useState(false);

  if (!content.overview) return null;

  const shouldShowExpandButton = content.overview.length > 200;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Özet
      </Text>

      <Text
        style={[styles.overview, { color: colors.textSecondary }]}
        numberOfLines={expanded ? undefined : 4}
      >
        {content.overview}
      </Text>

      {shouldShowExpandButton && (
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Text style={[styles.expandButton, { color: colors.primary }]}>
            {expanded ? 'Daha Az Göster' : 'Devamını Oku'}
          </Text>
        </TouchableOpacity>
      )}
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
  overview: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  expandButton: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
});
