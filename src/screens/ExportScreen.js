import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { executeSql } from '../database';

export default function ExportScreen() {
  const [exporting, setExporting] = useState(false);

  async function exportData(includeFlags = false) {
    setExporting(true);
    try {
      const dosePoints = await executeSql(
        includeFlags
          ? 'SELECT * FROM dose_points'
          : "SELECT * FROM dose_points WHERE status = 'confirmed'"
      );
      const smears = await executeSql(
        includeFlags
          ? 'SELECT * FROM smear_samples'
          : "SELECT * FROM smear_samples WHERE status = 'confirmed'"
      );
      // Format as CSV-like strings.
      let csv = 'dose_points\n';
      csv += dosePoints.map(dp => JSON.stringify(dp)).join('\n');
      csv += '\nsmear_samples\n';
      csv += smears.map(s => JSON.stringify(s)).join('\n');
      Alert.alert('Export Data', csv.substring(0, 1000) + (csv.length > 1000 ? '... (truncated)' : ''));
    } catch (err) {
      console.error(err);
    }
    setExporting(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Export</Text>
      <TouchableOpacity style={styles.button} onPress={() => exportData(false)}>
        <Text style={styles.buttonText}>Export Confirmed Only</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => exportData(true)}>
        <Text style={styles.buttonText}>Export Including Flags</Text>
      </TouchableOpacity>
      {exporting && <Text>Exporting...</Text>}
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
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 8
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center'
  }
});
