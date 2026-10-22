// Firebase web config. The wall shares the Realtime Database of the GE5072 Live Quiz (Hakoot) project; its data
// lives under walls/ and wallIndex/. These values are public by design (they only name the project); access is
// controlled by database.rules.json, which is the same document as ge5072-live-quiz/database.rules.json.
export const firebaseConfig = {
  apiKey: 'AIzaSyByVi2sCLbz9FF8561o9d8bUxaXfpoKi0A',
  authDomain: 'ge5072-live-quiz.firebaseapp.com',
  databaseURL: 'https://ge5072-live-quiz-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ge5072-live-quiz',
  appId: '1:706976356168:web:7a3650c8109dacbcb6c57d',
};
