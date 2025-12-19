import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { executeSql } from '../database';

export default function ReviewScreen() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    async function loadSessions() {
      const rows = await executeSql('SELECT * FROM sessions ORDER BY start_time DESC');
      setSessions(rows);
    }
    loadSessions();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={item => item.session_id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>Type: {item.type}</Text>
            <Text>Start: {new Date(item.start_time).toLocaleString()}</Text>
            <Text>Tech: {item.tech_initials || 'N/A'}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  }
});
