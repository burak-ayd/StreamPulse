import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useThemeContext } from '@context/ThemeContext';

export default function CrewSection({ content }) {
  const { colors } = useThemeContext();

  const crewItems = [
    {
      icon: 'videocam-outline',
      label: content.content_type === 'movie' ? 'Yönetmen' : 'Yaratıcı',
      value: content.content_type === 'movie' ? content.director : content.creator,
    },
    {
      icon: 'business-outline',
      label: 'Yapım Şirketi',
      value: content.production_co,
    },
    {
      icon: 'language-outline',
      label: 'Orijinal Dil',
      value: content.language?.toUpperCase(),
    },
  ].filter((item) => item.value);

  if (crewItems.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Yapım Bilgileri
      </Text>

      <View style={styles.crewList}>
        {crewItems.map((item, index) => (
          <View
            key={index}
            style={[
              styles.crewItem,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.crewHeader}>
              <Ionicons name={item.icon} size={18} color={colors.primary} />
              <Text style={[styles.crewLabel, { color: colors.textSecondary }]}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.crewValue, { color: colors.text }]}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
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
  crewList: {
    gap: 12,
  },
  crewItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  crewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  crewLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  crewValue: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 26,
  },
});
