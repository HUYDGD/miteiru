import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import {LearningStateType} from "../../renderer/components/types";


// Skill Constants
const SkillConstants = {
  Writing: 'writing',
  Conveyance: 'conveyance',
  Translation: 'translation'
};

// Utility function to get the current timestamp
const now = () => Math.floor(Date.now() / 1000);

// Skill Class
class Skill {
  skillName: string;
  lastUpdated: number;
  level: number;

  constructor(name) {
    this.skillName = name;
    this.lastUpdated = now();
    this.level = 0;
  }
}

// SRSData Class
class SRSData {
  character: string;
  lastUpdated: number;
  lastCreated: number;
  skills: Map<string, Skill>;

  constructor(char) {
    this.character = char;
    this.lastUpdated = now();
    this.lastCreated = now();
    this.skills = new Map();
    for (const key of Object.keys(SkillConstants)) {
      this.skills.set(SkillConstants[key], new Skill(SkillConstants[key]));
    }
  }
}

// OrderedTree Class
class OrderedTree {
  container
  generateKey: (SRSData) => any;

  constructor(initialData = [], keyGenerator) {
    this.container = new Set();
    this.generateKey = keyGenerator;
    for (const curData of initialData) {
      this.insert(curData);
    }
  }

  insert(a) {
    const currentKey = this.generateKey(a);
    this.container.add({key: currentKey, character: a.character});
  }

  erase(a) {
    const currentKey = this.generateKey(a);
    this.container.delete(currentKey);
  }

  orderOfKey(a) {
    const currentKey = this.generateKey(a);
    let index = 0;
    for (const item of this.container) {
      if (item.key === currentKey) {
        return index;
      }
      index++;
    }
    return -1;
  }

  findByOrder(index) {
    if (index >= this.container.size) return null;
    let i = 0;
    for (const item of this.container) {
      if (i === index) {
        return item;
      }
      i++;
    }
    return null;
  }
}

// SRSDatabase Class
class SRSDatabase {
  static learningTrees = new Map();
  static srsData = new Map();
  static db;

  static setup(db) {
    for (const key of Object.keys(SkillConstants)) {
      this.learningTrees.set(
          SkillConstants[key],
          new OrderedTree(Array.from(this.srsData.values()), this.classicKeyGen)
      );
    }
    this.db = db;
  }

  static async loadSRS(lang) {
    const prefix = `srs/${lang}/`;

    const queryOptions = {
      gte: prefix,
      lte: `${prefix}\uFFFF`
    };

    for await (const [key, value] of this.db.iterator(queryOptions)) {
      const strippedKey = key.substring(prefix.length);
      const parsedValue = JSON.parse(value);
      this.srsData.set(strippedKey, parsedValue);
    }
  }

  static insertNew(character) {
    const newSrs = new SRSData(character);
    this.srsData.set(character, newSrs);
  }

  static updateLearningTrees(character, skillName, newLevel) {
    const ptrToSRSData = this.srsData.get(character);
    if (!ptrToSRSData) return;

    this.learningTrees.get(SkillConstants[skillName]).erase(ptrToSRSData);

    ptrToSRSData.skills.get(skillName).level = newLevel;
    ptrToSRSData.skills.get(skillName).lastUpdated = now();
    ptrToSRSData.lastUpdated = now();

    this.learningTrees.get(SkillConstants[skillName]).insert(ptrToSRSData);
  }

  static classicKeyGen(srsData) {
    // Example key generator based on lastUpdated
    return srsData.lastUpdated;
  }
}


class Learning {
  static dbPath;
  static db;

  static setup() {
    // Define the path to the database
    this.dbPath = path.join(app.getPath('userData'), 'learningStateDB');
    this.db = new Level(this.dbPath);
    SRSDatabase.setup(this.db)
  }

  static registerHandler() {
    ipcMain.handle('loadLearningState', async (event, lang) => {
      try {
        const prefix = `${lang}/`; // Define the prefix for keys
        const learningState = {};

        // Define the range for the query
        const queryOptions = {
          gte: prefix, // Start of the range: include the prefix
          lte: `${prefix}\uFFFF`, // End of the range: highest value that still matches the prefix
        };

        // Efficiently iterate over keys within the specified range
        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          let parsedValue;

          try {
            parsedValue = JSON.parse(value);
            if (typeof parsedValue.level !== 'number' || typeof parsedValue.updTime !== 'number') {
              throw new Error('Invalid format');
            }
          } catch (e) {
            // If parsing fails, assume it's an old format (number)
            parsedValue = {
              level: parseInt(value, 10),
              updTime: Date.now()
            };
            await this.db.put(key, JSON.stringify(parsedValue));
          }

          learningState[strippedKey] = parsedValue;
        }

        return learningState;
      } catch (error) {
        console.error('Error loading learning state:', error);
        return {};
      }
    });


    // Handler to update a specific content's learning state
    ipcMain.handle('updateContent', async (event, content, lang, data) => {
      if (!content) return true;
      try {
        await this.db.put(`${lang}/${content}`, JSON.stringify(data));
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    // Handler to update a batch of contents' learning states
    ipcMain.handle('updateContentBatch', async (event, contents: LearningStateType, lang) => {
      if (!contents) return true;
      try {
        for (const [key, value] of Object.entries(contents)) {
          const goUpdate = async () => {
            await this.db.put(`${lang}/${key}`, JSON.stringify(value));
          }
          this.db.get(`${lang}/${key}`).then(async val => {
            const parsedVal = JSON.parse(val);
            if (parsedVal.level < value.level) await goUpdate();
          }).catch(async () => {
            await goUpdate();
          })
        }
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    ipcMain.handle('updateSRSContent', async (event, char, lang, data) => {
      if (!char) return false;
      try {
        await this.db.put(`srs/${lang}/${char}`, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('Error updating SRS content:', error);
        return false;
      }
    });

    ipcMain.handle('getQuestion', async (event, lang) => {
      try {
        const prefix = `srs/${lang}/`;
        const srsState = {};
        const queryOptions = {
          gte: prefix,
          lte: `${prefix}\uFFFF`,
        };

        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          srsState[strippedKey] = JSON.parse(value);
        }

        return srsState;
      } catch (error) {
        console.error('Error loading SRS state:', error);
        return {};
      }
    });
  }
}

export default Learning;