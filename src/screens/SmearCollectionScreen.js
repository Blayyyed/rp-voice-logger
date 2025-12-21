import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { v4 as uuidv4 } from 'react-native-uuid';
// import Voice from '@react-native-voice/voice';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
ort { executeSql } from '../database';

export default function SmearCollectionScreen({ navigation }) {
  const [sessionId, setSessionId] = useState(null);
  const [smearSetId, setSmearSetId] = useState(null);
  const [smearNumber, setSmearNumber] = useState(1);
  const [collecting, setCollecting] = useState(false);
  const [lastLocation, setLastLocation] = useState('');

  async function startCollection() {
    const sessId = uuidv4();
    const smearId = uuidv4();
    setSessionId(sessId);
    setSmearSetId(smearId);
    // Insert session and smear_set.
    await executeSql(
      `INSERT INTO sessions (session_id, type, start_time) VALUES (?, 'smearCollection', ?)`,
      [sessId, Date.now()]
    );
    await executeSql(
      `INSERT INTO smear_sets (smear_set_id, session_id, created_time) VALUES (?, ?, ?)`,
      [smearId, sessId, Date.now()]
    );
    setCollecting(true);
    Speech.speak('Smear collection started. Please say smear data and location.');
  }

  async function handleRecognised(locationPhrase) {
    // Insert smear sample with location.
    const id = uuidv4();
    await executeSql(
      `INSERT INTO smear_samples (id, smear_set_id, smear_number, location_phrase, status) VALUES (?, ?, ?, ?, 'draft')`,
      [id, smearSetId, smearNumber, locationPhrase]
    );
    setLastLocation(locationPhrase);
    Speech.speak(`Smear ${smearNumber} location ${locationPhrase}. Say Correct to confirm or Repeat.`);
  }

  return (
    <View style={styles.container}>
      {!collecting ? (
        <TouchableOpacity style={styles.button} onPress={startCollection}>
          <Text style={styles.buttonText}>Start Smear Collection</Text>
        </TouchableOpacity>
      ) : (
        <View>
          <Text>Smear #{smearNumber}</Text>
          <Text>Listening for location phrase… (Not implemented)</Text>
          {lastLocation ? (
            <Text>Last location: {lastLocation}</Text>
          ) : null}
        </View>
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
    borderRadius: 8
  },
  buttonText: {
    color: '#fff',
    fontSize: 16
  }
});
