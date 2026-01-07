import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getItem(key, fallback = null) {
  try {
    const value = await AsyncStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    console.error("Storage get failed", key, error);
    return fallback;
  }
}

export async function setItem(key, value) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.error("Storage set failed", key, error);
  }
}

export async function getJson(key, fallback = null) {
  const raw = await getItem(key, null);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Storage JSON parse failed", key, error);
    await removeItem(key); // remove invalid value so future reads succeed
    return fallback;
  }
}

export async function setJson(key, value) {
  try {
    await setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Storage JSON set failed", key, error);
  }
}

export async function removeItem(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error("Storage remove failed", key, error);
  }
}
