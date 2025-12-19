import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Speech from 'expo-speech';
import { executeSql } from '../database';

export default function SmearCountingScreen() {
  const [samples, setSamples] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Load most recent smear set and samples.
    async function loadSamples() {
      const sets = await executeSql('SELECT smear_set_id FROM smear_sets ORDER BY created_time DESC LIMIT 1');
      if (sets.length > 0) {
        const setId = sets[0].smear_set_id;
        const rows = await executeSql('SELECT * FROM smear_samples WHERE smear_set_id = ? ORDER BY smear_number', [setId]);
        setSamples(rows);
        if (rows.length > 0) {
          Speech.speak(`Loaded ${rows.length} smear samples. Start counting?`);
        } else {
          Speech.speak('No smear samples found.');
        }
      }
    }
    loadSamples();
  }, []);

  function nextSample() {
    if (currentIndex + 1 < samples.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      Speech.speak('All samples counted.');
    }
  }

  const sample = samples[currentIndex];
  return (
    <View style={styles.container}>
      {sample ? (
        <View>
          <Text>
            Smear {sample.smear_number}: {sample.location_phrase}
          </Text>
          <Text>Counting flow not implemented in this skeleton.</Text>
          <TouchableOpacity style={styles.button} onPress={nextSample}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text>Loading or no samples available.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12
  },
  buttonText: {
    color: '#fff',
    fontSize: 16
  }
});
