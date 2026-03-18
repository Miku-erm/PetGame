import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const MIN_STAT = 0;
const MAX_STAT = 100;
const LEVEL_XP = 120;
const DAY_INTERVAL_MS = 8000;
const SPRITE_SIZE = 32;
const UI_TILE = 16;
const UI_ATLAS_WIDTH = 256;
const UI_ATLAS_HEIGHT = 128;

const IDLE_SPRITE = require('./CatPackFree/CatPackFree/Idle.png');
const DRCULA_SPRITE = require('./CatPackFree/CatPackFree/drculacat.png');
const BOX_SPRITE = require('./CatPackFree/CatPackFree/Box3.png');
const UI_ATLAS = require('./CatUIFree/CatUIFree/free.png');

const PET_STAGES = [
  { key: 'baby', minDay: 1, label: 'Baby', accent: '#F08C52' },
  { key: 'child', minDay: 3, label: 'Child', accent: '#2D9C73' },
  { key: 'teen', minDay: 6, label: 'Teen', accent: '#4C57D1' },
  { key: 'elite', minDay: 10, label: 'Elite', accent: '#9B5DE5' },
];

const ACHIEVEMENTS = [
  {
    id: 'caretaker',
    icon: '🍼',
    title: 'Caretaker',
    description: '3 kez besle.',
    isUnlocked: (state) => state.feedCount >= 3,
  },
  {
    id: 'clean-room',
    icon: '🧼',
    title: 'Clean Room',
    description: '3 kez temizlik yap.',
    isUnlocked: (state) => state.cleanCount >= 3,
  },
  {
    id: 'night-watch',
    icon: '🌙',
    title: 'Night Watch',
    description: 'Uyku modunu 2 kez kullan.',
    isUnlocked: (state) => state.sleepCount >= 2,
  },
  {
    id: 'doctor',
    icon: '💊',
    title: 'Mini Vet',
    description: 'Ilac kullanarak peti toparla.',
    isUnlocked: (state) => state.medicineCount >= 1,
  },
  {
    id: 'grown-up',
    icon: '✨',
    title: 'Evolution',
    description: 'Teen asamasina ulas.',
    isUnlocked: (state) => getPetStage(state.day).key === 'teen',
  },
  {
    id: 'survivor',
    icon: '🏆',
    title: 'Survivor',
    description: 'Kritik durumdan geri don.',
    isUnlocked: (state) => state.rescueCount >= 1,
  },
];

const UI_CROPS = {
  panel: { x: 0, y: 0, width: 112, height: 48 },
  stats: {
    hunger: { x: 96, y: 48, width: 16, height: 16 },
    happiness: { x: 112, y: 48, width: 16, height: 16 },
    energy: { x: 128, y: 48, width: 16, height: 16 },
    hygiene: { x: 96, y: 64, width: 16, height: 16 },
    health: { x: 112, y: 80, width: 16, height: 16 },
  },
  actions: {
    feed: { x: 144, y: 80, width: 16, height: 16 },
    play: { x: 144, y: 64, width: 16, height: 16 },
    clean: { x: 176, y: 80, width: 16, height: 16 },
    sleep: { x: 176, y: 64, width: 16, height: 16 },
    medicine: { x: 208, y: 80, width: 16, height: 16 },
  },
  headerIcon: { x: 32, y: 48, width: 32, height: 32 },
};

function clampStat(value) {
  return Math.min(MAX_STAT, Math.max(MIN_STAT, value));
}

function calculateLevel(xp) {
  return Math.floor(xp / LEVEL_XP) + 1;
}

function getLevelProgress(xp) {
  return ((xp % LEVEL_XP) / LEVEL_XP) * 100;
}

function getPetStage(day) {
  let stage = PET_STAGES[0];

  for (const candidate of PET_STAGES) {
    if (day >= candidate.minDay) {
      stage = candidate;
    }
  }

  return stage;
}

function getHealthLabel(health) {
  if (health >= 75) {
    return 'Stable';
  }

  if (health >= 45) {
    return 'Watch';
  }

  if (health >= 20) {
    return 'Low';
  }

  return 'Critical';
}

function getDirtLabel(count) {
  if (count === 0) {
    return 'Clean';
  }

  return `Dirt x${count}`;
}

function getCareScore(state) {
  return Math.max(
    0,
    Math.round(
      state.happiness * 0.7 +
        state.energy * 0.65 +
        state.hygiene * 0.8 +
        state.health * 1.1 +
        state.coins * 1.3 -
        state.hunger * 0.7 -
        state.poopCount * 12
    )
  );
}

function getPetView(state, name) {
  const stage = getPetStage(state.day);

  if (state.asleep) {
    return {
      title: 'Uyku modunda',
      subtitle: `${name} sessizce dinleniyor.`,
      surface: '#E7E6FF',
      accent: '#5B57C7',
      roomTone: '#D7D5FF',
      pixelMood: 'sleep',
    };
  }

  if (state.sick) {
    return {
      title: 'Bakim gerekiyor',
      subtitle: `${name} biraz ilgi ve ilac istiyor.`,
      surface: '#FFE0DA',
      accent: '#D06A46',
      roomTone: '#FFC7BC',
      pixelMood: 'sick',
    };
  }

  if (state.poopCount >= 2 || state.hygiene <= 30) {
    return {
      title: 'Oda dagildi',
      subtitle: `${name} temizlik bekliyor.`,
      surface: '#FFF0C8',
      accent: '#AF7A17',
      roomTone: '#FFE39A',
      pixelMood: 'dirty',
    };
  }

  if (state.hunger >= 78) {
    return {
      title: 'Acikti',
      subtitle: `${name} mama bekliyor.`,
      surface: '#FFE2D7',
      accent: '#D86A3F',
      roomTone: '#FFCBB8',
      pixelMood: 'hungry',
    };
  }

  if (state.happiness >= 80 && state.energy >= 45) {
    return {
      title: 'Keyfi yerinde',
      subtitle: `${name} seninle vakit gecirmekten mutlu.`,
      surface: '#DFF7E6',
      accent: '#248C63',
      roomTone: '#BDECCB',
      pixelMood: 'happy',
    };
  }

  return {
    title: 'Normal mod',
    subtitle: `${name} yeni aksiyonlar bekliyor.`,
    surface: '#E5EEFF',
    accent: '#3466C8',
    roomTone: '#C8DAFF',
    pixelMood: 'normal',
  };
}

function getMissionText(state) {
  if (state.poopCount >= 2 || state.hygiene <= 35) {
    return 'Siradaki gorev: Odayi temizle ve hijyeni toparla.';
  }

  if (state.sick || state.health <= 35) {
    return 'Siradaki gorev: Ilac vererek sagligi yukselt.';
  }

  if (state.hunger >= 70) {
    return 'Siradaki gorev: Besle ile acligi dusur.';
  }

  if (state.energy <= 30) {
    return 'Siradaki gorev: Uyku moduna alip enerji topla.';
  }

  if (state.happiness <= 50) {
    return 'Siradaki gorev: Oyna ile mutlulugu arttir.';
  }

  if (getPetStage(state.day).key !== 'elite') {
    return 'Siradaki gorev: Gunu ilerlet ve peti gelistir.';
  }

  return 'Tum sistemler iyi. Yeni skor icin peti dengede tut.';
}

function UiAtlasCrop({ crop, scale = 1, style }) {
  return (
    <View
      style={[
        styles.uiAtlasViewport,
        {
          width: crop.width * scale,
          height: crop.height * scale,
        },
        style,
      ]}
    >
      <Image
        source={UI_ATLAS}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          left: -(crop.x * scale),
          top: -(crop.y * scale),
          width: UI_ATLAS_WIDTH * scale,
          height: UI_ATLAS_HEIGHT * scale,
          imageRendering: 'pixelated',
        }}
      />
    </View>
  );
}

function UiTileIcon({ crop, scale = 1.6, frameTone = '#F8F1E9' }) {
  return (
    <View style={[styles.uiTileFrame, { backgroundColor: frameTone }]}>
      <UiAtlasCrop crop={crop} scale={scale} />
    </View>
  );
}

function getSpriteConfig(mood, stageKey) {
  if (mood === 'sleep') {
    return {
      source: BOX_SPRITE,
      totalFrames: 4,
      frameStart: 0,
      frameEnd: 3,
      frameDuration: 280,
      scale: 3,
    };
  }

  const usesDrcula = stageKey === 'elite';

  if (usesDrcula) {
    return {
      source: DRCULA_SPRITE,
      totalFrames: 6,
      frameStart: 0,
      frameEnd: 5,
      frameDuration: mood === 'happy' ? 110 : 170,
      scale: 3,
    };
  }

  if (mood === 'happy') {
    return {
      source: IDLE_SPRITE,
      totalFrames: 10,
      frameStart: 0,
      frameEnd: 9,
      frameDuration: 110,
      scale: 3,
    };
  }

  if (mood === 'hungry') {
    return {
      source: IDLE_SPRITE,
      totalFrames: 10,
      frameStart: 2,
      frameEnd: 6,
      frameDuration: 210,
      scale: 3,
    };
  }

  return {
    source: IDLE_SPRITE,
    totalFrames: 10,
    frameStart: 0,
    frameEnd: 7,
    frameDuration: mood === 'dirty' || mood === 'sick' ? 220 : 160,
    scale: 3,
  };
}

function SpriteFrame({ source, totalFrames, frameIndex, scale }) {
  return (
    <View
      style={[
        styles.spriteViewport,
        {
          width: SPRITE_SIZE * scale,
          height: SPRITE_SIZE * scale,
        },
      ]}
    >
      <Image
        source={source}
        resizeMode="stretch"
        style={{
          width: SPRITE_SIZE * totalFrames * scale,
          height: SPRITE_SIZE * scale,
          transform: [{ translateX: -(frameIndex * SPRITE_SIZE * scale) }],
          imageRendering: 'pixelated',
        }}
      />
    </View>
  );
}

function PetSprite({ mood, stageKey, isSleeping }) {
  const config = useMemo(() => getSpriteConfig(mood, stageKey), [mood, stageKey]);
  const [frameIndex, setFrameIndex] = useState(config.frameStart);

  useEffect(() => {
    setFrameIndex(config.frameStart);

    const timer = setInterval(() => {
      setFrameIndex((current) =>
        current >= config.frameEnd ? config.frameStart : current + 1
      );
    }, config.frameDuration);

    return () => clearInterval(timer);
  }, [config]);

  return (
    <View style={styles.petSpriteWrap}>
      <View
        style={[
          styles.spriteCard,
          isSleeping && styles.spriteSleeping,
        ]}
      >
        <SpriteFrame
          source={config.source}
          totalFrames={config.totalFrames}
          frameIndex={frameIndex}
          scale={config.scale}
        />
      </View>

      {isSleeping && (
        <View style={styles.sleepBadge}>
          <Text style={styles.sleepBadgeText}>Zz</Text>
        </View>
      )}
    </View>
  );
}

function MetricTile({ label, value, tone, compact = false }) {
  return (
    <View style={[styles.metricTile, compact && styles.metricTileCompact, { backgroundColor: tone }]}>
      <Text style={[styles.metricLabel, compact && styles.metricLabelCompact]}>{label}</Text>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text>
    </View>
  );
}

function StatBar({ label, value, accentColor, iconCrop, compact = false, dense = false }) {
  return (
    <View style={[styles.statBlock, compact && styles.statBlockCompact, dense && styles.statBlockDense]}>
      <View style={[styles.statRow, dense && styles.statRowDense]}>
        <View style={[styles.statLabelRow, dense && styles.statLabelRowDense]}>
          <UiTileIcon
            crop={iconCrop}
            scale={dense ? 0.82 : compact ? 0.95 : 1.2}
            frameTone="#F7EFE7"
          />
          <Text style={[styles.statLabel, compact && styles.statLabelCompact, dense && styles.statLabelDense]}>
            {label}
          </Text>
        </View>
        <Text style={[styles.statValue, compact && styles.statValueCompact, dense && styles.statValueDense]}>
          {value}/100
        </Text>
      </View>
      <View style={[styles.statTrack, compact && styles.statTrackCompact, dense && styles.statTrackDense]}>
        <View
          style={[
            styles.statFill,
            {
              width: `${value}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

function StatusChip({ label, value, tone, compact = false }) {
  return (
    <View style={[styles.statusChip, compact && styles.statusChipCompact, { backgroundColor: tone }]}>
      <Text style={[styles.statusChipLabel, compact && styles.statusChipLabelCompact]}>{label}</Text>
      <Text style={[styles.statusChipValue, compact && styles.statusChipValueCompact]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  title,
  caption,
  iconCrop,
  tag,
  impact,
  color,
  onPress,
  compact = false,
  dense = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        dense && styles.actionButtonDense,
        {
          backgroundColor: color,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.actionTopRow}>
        <UiTileIcon
          crop={iconCrop}
          scale={dense ? 0.82 : compact ? 1.05 : 1.4}
          frameTone="rgba(255, 255, 255, 0.18)"
        />
        {!compact && <Text style={styles.actionTag}>{tag}</Text>}
      </View>
      <Text style={[styles.actionTitle, compact && styles.actionTitleCompact, dense && styles.actionTitleDense]}>
        {title}
      </Text>
      {!compact && <Text style={styles.actionCaption}>{caption}</Text>}
      {!compact && (
        <View style={styles.actionImpactPill}>
          <Text style={styles.actionImpactText}>{impact}</Text>
        </View>
      )}
    </Pressable>
  );
}

function NavigationButton({ label, active, onPress, compact = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        compact && styles.navButtonCompact,
        active && styles.navButtonActive,
        pressed && styles.navButtonPressed,
      ]}
    >
      <View style={[styles.navDot, compact && styles.navDotCompact, active && styles.navDotActive]} />
      <Text style={[styles.navLabel, compact && styles.navLabelCompact, active && styles.navLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AchievementBadge({ icon, title, description, unlocked }) {
  return (
    <View
      style={[
        styles.achievementCard,
        unlocked ? styles.achievementUnlocked : styles.achievementLocked,
      ]}
    >
      <Text style={styles.achievementIcon}>{icon}</Text>
      <Text style={styles.achievementTitle}>{title}</Text>
      <Text style={styles.achievementDescription}>{description}</Text>
      <Text style={styles.achievementStatus}>
        {unlocked ? 'Acildi' : 'Kilitli'}
      </Text>
    </View>
  );
}

function DigitalPetGame({ name, species }) {
  const { width, height } = useWindowDimensions();
  const compactPhone = width <= 420;
  const shortPhone = height <= 860;
  const [petState, setPetState] = useState({
    day: 1,
    tickCount: 0,
    hunger: 44,
    happiness: 72,
    energy: 68,
    hygiene: 80,
    health: 84,
    xp: 28,
    coins: 15,
    poopCount: 0,
    asleep: false,
    sick: false,
    totalActions: 0,
    comboCount: 0,
    lastAction: '',
    feedCount: 0,
    playCount: 0,
    cleanCount: 0,
    sleepCount: 0,
    medicineCount: 0,
    rescueCount: 0,
  });
  const [journalMessage, setJournalMessage] = useState(
    `${name} yumurtadan cikti. Ilk bakim turu baslayabilir.`
  );
  const [activeTab, setActiveTab] = useState('home');

  const petScale = useRef(new Animated.Value(1)).current;
  const previousLevel = useRef(calculateLevel(28));
  const previousStage = useRef(getPetStage(1).key);
  const previousSick = useRef(false);

  const level = calculateLevel(petState.xp);
  const levelProgress = getLevelProgress(petState.xp);
  const stage = getPetStage(petState.day);
  const score = getCareScore(petState);
  const healthLabel = getHealthLabel(petState.health);
  const petView = useMemo(() => getPetView(petState, name), [petState, name]);
  const unlockedCount = ACHIEVEMENTS.filter((achievement) =>
    achievement.isUnlocked(petState)
  ).length;

  const pulsePet = () => {
    Animated.sequence([
      Animated.timing(petScale, {
        toValue: 1.08,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(petScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const applyAction = (type) => {
    setPetState((current) => {
      const wasCritical =
        current.health <= 35 ||
        current.hunger >= 78 ||
        current.hygiene <= 30 ||
        current.poopCount >= 2;
      const comboCount = current.lastAction === type ? current.comboCount + 1 : 1;

      let nextState = {
        ...current,
        totalActions: current.totalActions + 1,
        lastAction: type,
        comboCount,
      };

      if (type === 'feed') {
        nextState = {
          ...nextState,
          hunger: clampStat(current.hunger - 22),
          happiness: clampStat(current.happiness + 4),
          energy: clampStat(current.energy + 2),
          hygiene: clampStat(current.hygiene - 2),
          xp: current.xp + 30,
          coins: current.coins + 4,
          poopCount:
            (current.feedCount + 1) % 2 === 0
              ? Math.min(3, current.poopCount + 1)
              : current.poopCount,
          feedCount: current.feedCount + 1,
        };
        setJournalMessage(`${name} mama yedi. Karni doydu ve biraz guclendi.`);
      }

      if (type === 'play') {
        nextState = {
          ...nextState,
          hunger: clampStat(current.hunger + 5),
          happiness: clampStat(current.happiness + 16),
          energy: clampStat(current.energy - 6),
          hygiene: clampStat(current.hygiene - 3),
          xp: current.xp + 34,
          coins: current.coins + 5,
          playCount: current.playCount + 1,
        };
        setJournalMessage(`${name} oynadi ve keyfi yerine geldi.`);
      }

      if (type === 'clean') {
        nextState = {
          ...nextState,
          hygiene: clampStat(current.hygiene + 30),
          health: clampStat(current.health + 10),
          poopCount: Math.max(0, current.poopCount - 2),
          xp: current.xp + 24,
          coins: current.coins + 3,
          cleanCount: current.cleanCount + 1,
        };
        setJournalMessage(`${name} ve odasi temizlendi. Ortam toparlandi.`);
      }

      if (type === 'sleep') {
        if (current.asleep) {
          nextState = {
            ...nextState,
            asleep: false,
            happiness: clampStat(current.happiness + 4),
            xp: current.xp + 12,
            coins: current.coins + 2,
            sleepCount: current.sleepCount + 1,
          };
          setJournalMessage(`${name} uyandi. Yeni bir gun icin hazir.`);
        } else {
          nextState = {
            ...nextState,
            asleep: true,
            health: clampStat(current.health + 2),
            xp: current.xp + 18,
            coins: current.coins + 2,
            sleepCount: current.sleepCount + 1,
          };
          setJournalMessage(`${name} uyku moduna gecti. Zzz...`);
        }
      }

      if (type === 'medicine') {
        nextState = {
          ...nextState,
          health: clampStat(current.health + 20),
          hygiene: clampStat(current.hygiene + 6),
          happiness: clampStat(current.happiness - 1),
          coins: Math.max(0, current.coins - 2),
          xp: current.xp + 20,
          medicineCount: current.medicineCount + 1,
        };
        setJournalMessage(`${name} ilac aldi. Biraz toparlaniyor.`);
      }

      const sick =
        nextState.health <= 35 ||
        (nextState.hygiene <= 25 && nextState.poopCount >= 2);

      nextState = {
        ...nextState,
        sick,
      };

      const recovered =
        nextState.health >= 55 &&
        nextState.hunger <= 65 &&
        nextState.hygiene >= 45 &&
        nextState.poopCount <= 1;

      if (wasCritical && recovered) {
        nextState = {
          ...nextState,
          rescueCount: current.rescueCount + 1,
        };
      }

      return nextState;
    });

    pulsePet();
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setPetState((current) => {
        const tickCount = current.tickCount + 1;
        const nextDay = tickCount % 2 === 0 ? current.day + 1 : current.day;
        const nextPoopCount =
          !current.asleep && tickCount % 3 === 0
            ? Math.min(3, current.poopCount + 1)
            : current.poopCount;

        const hunger = clampStat(current.hunger + (current.asleep ? 4 : 7));
        const happiness = clampStat(
          current.happiness - (current.asleep ? 1 : current.poopCount > 0 ? 6 : 4)
        );
        const energy = clampStat(current.energy + (current.asleep ? 14 : -6));
        const hygiene = clampStat(
          current.hygiene - (current.asleep ? 2 : 5) - nextPoopCount * 4
        );

        let health = current.health;
        if (hunger >= 80) {
          health -= 5;
        }
        if (happiness <= 25) {
          health -= 4;
        }
        if (hygiene <= 30) {
          health -= 6;
        }
        if (current.asleep && current.energy <= 80) {
          health += 2;
        }

        const sick =
          health <= 35 || (hygiene <= 25 && nextPoopCount >= 2);

        return {
          ...current,
          day: nextDay,
          tickCount,
          hunger,
          happiness,
          energy,
          hygiene,
          health: clampStat(health),
          poopCount: nextPoopCount,
          sick,
        };
      });
    }, DAY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (level > previousLevel.current) {
      setJournalMessage(`${name} level atladi. Bakim rutini ise yariyor.`);
      pulsePet();
    }
    previousLevel.current = level;
  }, [level, name]);

  useEffect(() => {
    if (stage.key !== previousStage.current) {
      setJournalMessage(`${name} evrim gecirdi. Yeni asama: ${stage.label}.`);
      pulsePet();
    }
    previousStage.current = stage.key;
  }, [stage, name]);

  useEffect(() => {
    if (petState.sick && !previousSick.current) {
      setJournalMessage(`${name} kendini iyi hissetmiyor. Temizlik veya ilac gerekli.`);
    }
    previousSick.current = petState.sick;
  }, [petState.sick, name]);

  const missionText = getMissionText(petState);
  const currentTabCopy = {
    home: '',
    awards: 'Acilan rozetler ve ilerleme ozeti burada.',
  };

  return (
    <View style={[styles.screenShell, compactPhone && styles.screenShellCompact]}>
      <View style={[styles.heroPanel, compactPhone && styles.heroPanelCompact]}>
        <Text style={styles.heroEyebrow}>Challenge 04</Text>
        <Text style={[styles.heroTitle, compactPhone && styles.heroTitleCompact]}>Pocket Tamagotchi</Text>
        {!!currentTabCopy[activeTab] && (
          <Text style={[styles.heroSubtitle, compactPhone && styles.heroSubtitleCompact]}>
            {currentTabCopy[activeTab]}
          </Text>
        )}
      </View>

      <View style={[styles.metricRow, compactPhone && styles.metricRowCompact]}>
        <MetricTile label="Care Score" value={score} tone="#FFEBD5" compact={compactPhone} />
        <MetricTile label="Day" value={petState.day} tone="#E2F5E7" compact={compactPhone} />
        <MetricTile label="Coins" value={petState.coins} tone="#E2EAFF" compact={compactPhone} />
      </View>

      <View style={styles.contentArea}>
        {activeTab === 'home' && (
          <View style={styles.pageCard}>
            <View
              style={[
                styles.card,
                styles.homePanel,
                compactPhone && styles.homePanelCompact,
                { borderColor: petView.accent },
              ]}
            >
              <View style={[styles.homeStatusRow, compactPhone && styles.homeStatusRowCompact]}>
                <StatusChip label="Stage" value={stage.label} tone="#F8F0E8" compact={compactPhone} />
                <StatusChip
                  label="Mode"
                  value={petState.asleep ? 'Sleep' : 'Awake'}
                  tone="#F8F0E8"
                  compact={compactPhone}
                />
                <StatusChip label="Health" value={healthLabel} tone="#F8F0E8" compact={compactPhone} />
              </View>

              <View style={[styles.homeHeroRow, compactPhone && styles.homeHeroRowCompact]}>
                <View
                  style={[
                    styles.petRoom,
                    compactPhone && styles.petRoomCompact,
                    { backgroundColor: petView.roomTone },
                  ]}
                >
                  <View style={styles.roomLightsRow}>
                    <View style={[styles.roomLight, { backgroundColor: petView.accent }]} />
                    <View style={styles.roomLightMuted} />
                    <View style={styles.roomLightMuted} />
                  </View>

                  <Animated.View
                    style={[
                      styles.petAvatarWrap,
                      styles.petAvatarCompact,
                      compactPhone && styles.petAvatarUltraCompact,
                      {
                        transform: [{ scale: petScale }],
                        borderColor: petView.accent,
                        backgroundColor: petView.surface,
                      },
                    ]}
                  >
                    <PetSprite
                      mood={petView.pixelMood}
                      stageKey={stage.key}
                      isSleeping={petState.asleep}
                    />
                  </Animated.View>

                  <View style={styles.petRoomFooter}>
                    <Text style={styles.poopLabel}>Room</Text>
                    <Text style={styles.poopValue}>{getDirtLabel(petState.poopCount)}</Text>
                  </View>
                </View>

                <View style={[styles.homeInfoColumn, compactPhone && styles.homeInfoColumnCompact]}>
                  <Text style={[styles.petName, compactPhone && styles.petNameCompact]}>{name}</Text>
                  <Text style={[styles.petSpecies, compactPhone && styles.petSpeciesCompact]}>{species}</Text>
                  <View
                    style={[
                      styles.moodBadge,
                      compactPhone && styles.moodBadgeCompact,
                      { backgroundColor: petView.accent },
                    ]}
                  >
                    <Text style={styles.moodBadgeText}>{petView.title}</Text>
                  </View>
                  <Text
                    numberOfLines={compactPhone ? 2 : 3}
                    style={[styles.petMessage, compactPhone && styles.petMessageCompact]}
                  >
                    {petView.subtitle}
                  </Text>

                  <View style={[styles.infoStripCompact, compactPhone && styles.infoStripCompactTight]}>
                    <Text style={styles.infoStripLabel}>Son olay</Text>
                    <Text numberOfLines={compactPhone ? 2 : 3} style={styles.infoStripText}>
                      {journalMessage}
                    </Text>
                  </View>

                  <View style={[styles.levelCardCompact, compactPhone && styles.levelCardCompactTight]}>
                    <View style={styles.levelRow}>
                      <Text style={styles.levelLabel}>XP</Text>
                      <Text style={styles.levelValue}>{petState.xp} | Lv {level}</Text>
                    </View>
                    <View style={styles.levelTrack}>
                      <View
                        style={[
                          styles.levelFill,
                          {
                            width: `${levelProgress}%`,
                            backgroundColor: petView.accent,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={[styles.homeLowerRow, compactPhone && styles.homeLowerRowCompact]}>
                <View style={styles.homeNeedsColumn}>
                  <Text style={styles.panelEyebrow}>Needs</Text>
                  <StatBar
                    label="Aclik"
                    value={petState.hunger}
                    accentColor="#DE6E42"
                    iconCrop={UI_CROPS.stats.hunger}
                    compact
                    dense={compactPhone || shortPhone}
                  />
                  <StatBar
                    label="Mutluluk"
                    value={petState.happiness}
                    accentColor="#25926A"
                    iconCrop={UI_CROPS.stats.happiness}
                    compact
                    dense={compactPhone || shortPhone}
                  />
                  <StatBar
                    label="Enerji"
                    value={petState.energy}
                    accentColor="#5B57C7"
                    iconCrop={UI_CROPS.stats.energy}
                    compact
                    dense={compactPhone || shortPhone}
                  />
                  <StatBar
                    label="Hijyen"
                    value={petState.hygiene}
                    accentColor="#4BA3C7"
                    iconCrop={UI_CROPS.stats.hygiene}
                    compact
                    dense={compactPhone || shortPhone}
                  />
                  <StatBar
                    label="Saglik"
                    value={petState.health}
                    accentColor="#D15176"
                    iconCrop={UI_CROPS.stats.health}
                    compact
                    dense={compactPhone || shortPhone}
                  />
                </View>

                <View style={styles.homeActionsColumn}>
                  <View style={styles.quickActionsHeader}>
                    <Text style={styles.panelEyebrow}>Actions</Text>
                    <Text style={styles.quickActionsCombo}>x{petState.comboCount}</Text>
                  </View>

                  <View
                    style={[
                      styles.actionsGridCompact,
                      compactPhone && styles.actionsGridTight,
                    ]}
                  >
                    <ActionButton
                      title="Besle"
                      caption="Aclik dusur, enerji arttir"
                      iconCrop={UI_CROPS.actions.feed}
                      tag="Care"
                      impact="Hunger down"
                      color="#E77A49"
                      onPress={() => applyAction('feed')}
                      compact
                      dense={compactPhone}
                    />
                    <ActionButton
                      title="Oyna"
                      caption="Mutluluk arttir, enerji harca"
                      iconCrop={UI_CROPS.actions.play}
                      tag="Fun"
                      impact="Mood up"
                      color="#27966E"
                      onPress={() => applyAction('play')}
                      compact
                      dense={compactPhone}
                    />
                    <ActionButton
                      title="Temizle"
                      caption="Hijyen ve sagligi toparla"
                      iconCrop={UI_CROPS.actions.clean}
                      tag="Clean"
                      impact="Room reset"
                      color="#409CC0"
                      onPress={() => applyAction('clean')}
                      compact
                      dense={compactPhone}
                    />
                    <ActionButton
                      title={petState.asleep ? 'Uyandir' : 'Uyu'}
                      caption="Uyku dongusunu yonet"
                      iconCrop={UI_CROPS.actions.sleep}
                      tag="Rest"
                      impact="Energy up"
                      color="#5B57C7"
                      onPress={() => applyAction('sleep')}
                      compact
                      dense={compactPhone}
                    />
                    <ActionButton
                      title="Ilac"
                      caption="Sagligi yukselt, coin harca"
                      iconCrop={UI_CROPS.actions.medicine}
                      tag="Heal"
                      impact="Health up"
                      color="#D45B7A"
                      onPress={() => applyAction('medicine')}
                      compact
                      dense={compactPhone}
                    />
                  </View>

                  {!compactPhone && <Text style={styles.missionHint}>{missionText}</Text>}
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'awards' && (
          <View style={[styles.card, styles.pageCard]}>
            <View style={styles.achievementHeader}>
              <Text style={styles.sectionTitle}>Achievement Board</Text>
              <Text style={styles.achievementCount}>
                {unlockedCount}/{ACHIEVEMENTS.length}
              </Text>
            </View>

            <View style={styles.achievementsGrid}>
              {ACHIEVEMENTS.map((achievement) => (
                <AchievementBadge
                  key={achievement.id}
                  icon={achievement.icon}
                  title={achievement.title}
                  description={achievement.description}
                  unlocked={achievement.isUnlocked(petState)}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.bottomNav, compactPhone && styles.bottomNavCompact]}>
        <NavigationButton
          label="Home"
          active={activeTab === 'home'}
          onPress={() => setActiveTab('home')}
          compact={compactPhone}
        />
        <NavigationButton
          label="Awards"
          active={activeTab === 'awards'}
          onPress={() => setActiveTab('awards')}
          compact={compactPhone}
        />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.background}>
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />
        <View style={styles.orbThree} />
      </View>

      <DigitalPetGame name="Misket" species="Pocket companion" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4EEE6',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  orbOne: {
    position: 'absolute',
    top: 18,
    right: -10,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#FFD6B8',
    opacity: 0.8,
  },
  orbTwo: {
    position: 'absolute',
    top: 260,
    left: -70,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: '#DCE7FF',
    opacity: 0.75,
  },
  orbThree: {
    position: 'absolute',
    bottom: 16,
    right: 0,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: '#D9F3E4',
    opacity: 0.72,
  },
  screenShell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  screenShellCompact: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  heroPanel: {
    marginBottom: 8,
  },
  heroPanelCompact: {
    marginBottom: 6,
  },
  heroEyebrow: {
    color: '#7A684F',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 4,
    color: '#261F19',
    fontSize: 24,
    fontWeight: '900',
  },
  heroTitleCompact: {
    fontSize: 19,
  },
  heroSubtitle: {
    marginTop: 6,
    color: '#61584F',
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 340,
  },
  heroSubtitleCompact: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricRowCompact: {
    marginBottom: 8,
  },
  metricTile: {
    width: '31%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricTileCompact: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricLabel: {
    color: '#6C6156',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricLabelCompact: {
    fontSize: 10,
  },
  metricValue: {
    marginTop: 6,
    color: '#26201B',
    fontSize: 16,
    fontWeight: '900',
  },
  metricValueCompact: {
    marginTop: 4,
    fontSize: 13,
  },
  uiAtlasViewport: {
    position: 'relative',
    overflow: 'hidden',
  },
  uiTileFrame: {
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 39, 33, 0.08)',
  },
  deviceShell: {
    borderWidth: 4,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#17110B',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 8,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
  },
  pageCard: {
    flex: 1,
    marginBottom: 0,
    minHeight: 0,
  },
  homePanel: {
    flex: 1,
    borderWidth: 3,
    borderRadius: 30,
    borderColor: '#C98B37',
    padding: 12,
    minHeight: 0,
  },
  homePanelCompact: {
    borderRadius: 24,
    padding: 10,
  },
  homeStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  homeStatusRowCompact: {
    marginBottom: 8,
  },
  homeHeroRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  homeHeroRowCompact: {
    gap: 10,
    marginBottom: 8,
  },
  homeInfoColumn: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  homeInfoColumnCompact: {
    paddingTop: 2,
  },
  homeLowerRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 0,
  },
  homeLowerRowCompact: {
    gap: 8,
  },
  homeNeedsColumn: {
    flex: 0.52,
    minHeight: 0,
  },
  homeActionsColumn: {
    flex: 0.48,
    minHeight: 0,
  },
  panelEyebrow: {
    marginBottom: 6,
    color: '#6E6154',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  quickActionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickActionsCombo: {
    color: '#6A5E52',
    fontSize: 10,
    fontWeight: '800',
  },
  deviceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusChip: {
    width: '31%',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statusChipCompact: {
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  statusChipLabel: {
    color: '#73675D',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusChipLabelCompact: {
    fontSize: 9,
  },
  statusChipValue: {
    marginTop: 6,
    color: '#29221D',
    fontSize: 14,
    fontWeight: '900',
  },
  statusChipValueCompact: {
    marginTop: 4,
    fontSize: 11,
  },
  petRoom: {
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 3,
    borderColor: 'rgba(36, 28, 22, 0.09)',
    alignItems: 'center',
  },
  petRoomCompact: {
    width: 132,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  roomLightsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  roomLight: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  roomLightMuted: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  petAvatarWrap: {
    alignSelf: 'center',
    marginTop: 12,
    width: 150,
    height: 168,
    borderRadius: 10,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1F1812',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
  },
  petAvatarCompact: {
    width: 96,
    height: 112,
    marginTop: 8,
  },
  petAvatarUltraCompact: {
    width: 80,
    height: 92,
    marginTop: 6,
  },
  petSpriteWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  spriteCard: {
    borderWidth: 2,
    borderColor: 'rgba(36, 28, 22, 0.18)',
    backgroundColor: '#F8F2EA',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 0,
  },
  spriteSleeping: {
    backgroundColor: '#EFEAFE',
  },
  spriteViewport: {
    overflow: 'hidden',
  },
  sleepBadge: {
    position: 'absolute',
    top: -4,
    right: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5B57C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sleepBadgeText: {
    color: '#5B57C7',
    fontSize: 12,
    fontWeight: '900',
  },
  petRoomFooter: {
    marginTop: 8,
    alignItems: 'center',
  },
  poopLabel: {
    color: '#6A6057',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  poopValue: {
    marginTop: 4,
    color: '#2C251F',
    fontSize: 12,
    fontWeight: '800',
  },
  petName: {
    marginTop: 0,
    textAlign: 'left',
    color: '#231D18',
    fontSize: 20,
    fontWeight: '900',
  },
  petNameCompact: {
    fontSize: 16,
  },
  petSpecies: {
    marginTop: 5,
    textAlign: 'left',
    color: '#645B52',
    fontSize: 13,
    fontWeight: '600',
  },
  petSpeciesCompact: {
    marginTop: 2,
    fontSize: 11,
  },
  moodBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moodBadgeCompact: {
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  moodBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  petMessage: {
    marginTop: 6,
    textAlign: 'left',
    color: '#403830',
    fontSize: 11,
    lineHeight: 14,
  },
  petMessageCompact: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 12,
  },
  infoStripCompact: {
    marginTop: 6,
    borderRadius: 18,
    backgroundColor: '#F8F1E9',
    padding: 10,
  },
  infoStripCompactTight: {
    marginTop: 5,
    borderRadius: 16,
    padding: 8,
  },
  infoStripLabel: {
    color: '#796B5E',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoStripText: {
    marginTop: 4,
    color: '#2E2721',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  levelCardCompact: {
    marginTop: 6,
    borderRadius: 18,
    backgroundColor: '#F8F1E9',
    padding: 10,
  },
  levelCardCompactTight: {
    marginTop: 5,
    borderRadius: 16,
    padding: 8,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  levelLabel: {
    color: '#4A4037',
    fontSize: 12,
    fontWeight: '800',
  },
  levelValue: {
    color: '#4A4037',
    fontSize: 11,
    fontWeight: '700',
  },
  levelTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(38, 33, 29, 0.12)',
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: 999,
  },
  card: {
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    padding: 14,
    shadowColor: '#18120D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 5,
  },
  sectionTitle: {
    color: '#231D18',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionSubtitle: {
    marginTop: 4,
    marginBottom: 8,
    color: '#61574E',
    fontSize: 11,
    lineHeight: 14,
  },
  statBlock: {
    marginBottom: 6,
  },
  statBlockCompact: {
    marginBottom: 6,
  },
  statBlockDense: {
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statRowDense: {
    marginBottom: 4,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabelRowDense: {
    gap: 5,
  },
  statLabel: {
    color: '#2E2722',
    fontSize: 15,
    fontWeight: '800',
  },
  statLabelCompact: {
    fontSize: 11,
  },
  statLabelDense: {
    fontSize: 10,
  },
  statValue: {
    color: '#2E2722',
    fontSize: 14,
    fontWeight: '700',
  },
  statValueCompact: {
    fontSize: 10,
  },
  statValueDense: {
    fontSize: 9,
  },
  statTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(44, 38, 33, 0.11)',
    overflow: 'hidden',
  },
  statTrackCompact: {
    height: 8,
  },
  statTrackDense: {
    height: 6,
  },
  statFill: {
    height: '100%',
    borderRadius: 999,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  actionButton: {
    width: '48%',
    minHeight: 74,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
    shadowColor: '#1B1510',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
    elevation: 4,
  },
  actionsGridCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  actionsGridTight: {
    gap: 5,
  },
  actionButtonCompact: {
    width: '48%',
    minHeight: 54,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  actionButtonDense: {
    width: '31%',
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  actionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionTag: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  actionTitleCompact: {
    marginTop: 3,
    fontSize: 10,
    textAlign: 'center',
  },
  actionTitleDense: {
    marginTop: 2,
    fontSize: 9,
  },
  missionHint: {
    marginTop: 8,
    color: '#6A5E52',
    fontSize: 10,
    lineHeight: 13,
  },
  actionCaption: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
  actionImpactPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  actionImpactText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  achievementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  achievementCount: {
    color: '#5A4E43',
    fontSize: 15,
    fontWeight: '800',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  achievementCard: {
    width: '48%',
    borderRadius: 20,
    padding: 12,
  },
  achievementUnlocked: {
    backgroundColor: '#E3F7EB',
  },
  achievementLocked: {
    backgroundColor: '#F2ECE5',
  },
  achievementIcon: {
    fontSize: 28,
  },
  achievementTitle: {
    marginTop: 8,
    color: '#2A231D',
    fontSize: 14,
    fontWeight: '900',
  },
  achievementDescription: {
    marginTop: 6,
    color: '#645A50',
    fontSize: 12,
    lineHeight: 16,
  },
  achievementStatus: {
    marginTop: 8,
    color: '#2D6E50',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    padding: 8,
    shadowColor: '#1B1510',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  bottomNavCompact: {
    gap: 8,
    marginTop: 8,
    borderRadius: 20,
    padding: 6,
  },
  navButton: {
    flex: 0.4,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F0E7',
  },
  navButtonCompact: {
    borderRadius: 14,
    paddingVertical: 8,
  },
  navButtonActive: {
    backgroundColor: '#2E2822',
  },
  navButtonPressed: {
    opacity: 0.88,
  },
  navDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginBottom: 6,
    backgroundColor: '#C9BDAF',
  },
  navDotCompact: {
    width: 7,
    height: 7,
    marginBottom: 4,
  },
  navDotActive: {
    backgroundColor: '#F4D59B',
  },
  navLabel: {
    color: '#5E554D',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  navLabelCompact: {
    fontSize: 10,
  },
  navLabelActive: {
    color: '#FFFFFF',
  },
});
