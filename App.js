import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from './src/database';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import DoseSessionScreen from './src/screens/DoseSessionScreen';
import SmearCollectionScreen from './src/screens/SmearCollectionScreen';
import SmearCountingScreen from './src/screens/SmearCountingScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import ExportScreen from './src/screens/ExportScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// A bottom tab navigator for top-level sections: Home, Review, Export, Settings.
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Review') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Export') iconName = focused ? 'share' : 'share-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray'
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Review" component={ReviewScreen} />
      <Tab.Screen name="Export" component={ExportScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    // Initialise the database on app start.
    initDatabase();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="DoseSession" component={DoseSessionScreen} options={{ title: 'Dose Session' }} />
        <Stack.Screen name="SmearCollection" component={SmearCollectionScreen} options={{ title: 'Smear Collection' }} />
        <Stack.Screen name="SmearCounting" component={SmearCountingScreen} options={{ title: 'Smear Counting' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
