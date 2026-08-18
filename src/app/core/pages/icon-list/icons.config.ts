export const ICON_STYLE_CLASSES = [
  'fa-light',
  'fa-regular',
  'fa-solid',
  'fa-duotone',
] as const;

export type IconStyle = (typeof ICON_STYLE_CLASSES)[number];

export interface IconCategory {
  title: string;
  icon: readonly string[];
}

const lightIcons = (icons: string): readonly string[] =>
  icons
    .trim()
    .split(/\s+/)
    .map((icon) => `fa-light ${icon}`);

// 可用的 Font Awesome 图标，每个具名分类包含 100 个图标。
export const IconList: readonly IconCategory[] = [
  {
    title: '',
    icon: [''],
  },
  {
    title: '方向',
    icon: lightIcons(`
      fa-up fa-down fa-left fa-right
      fa-arrow-up fa-arrow-down fa-arrow-left fa-arrow-right
      fa-arrow-up-long fa-arrow-down-long fa-arrow-left-long fa-arrow-right-long
      fa-circle-up fa-circle-down fa-circle-left fa-circle-right
      fa-square-up fa-square-down fa-square-left fa-square-right
      fa-caret-up fa-caret-down fa-caret-left fa-caret-right
      fa-angle-up fa-angle-down fa-angle-left fa-angle-right
      fa-angles-up fa-angles-down fa-angles-left fa-angles-right
      fa-chevron-up fa-chevron-down fa-chevron-left fa-chevron-right
      fa-chevrons-up fa-chevrons-down fa-chevrons-left fa-chevrons-right
      fa-arrow-up-left fa-arrow-up-right fa-arrow-down-left fa-arrow-down-right
      fa-circle-arrow-up fa-circle-arrow-down fa-circle-arrow-left fa-circle-arrow-right
      fa-square-arrow-up fa-square-arrow-down fa-square-arrow-left fa-square-arrow-right
      fa-arrow-up-from-line fa-arrow-down-from-line fa-arrow-left-from-line fa-arrow-right-from-line
      fa-arrow-up-to-line fa-arrow-down-to-line fa-arrow-left-to-line fa-arrow-right-to-line
      fa-arrow-up-from-bracket fa-arrow-right-from-bracket fa-arrow-down-to-bracket fa-arrow-right-to-bracket
      fa-arrow-up-right-from-square fa-arrow-up-right-dots fa-arrow-up-right-and-arrow-down-left-from-center fa-arrow-down-left-and-arrow-up-right-to-center
      fa-arrow-right-arrow-left fa-arrows-left-right fa-arrows-up-down fa-arrows-up-down-left-right
      fa-arrows-rotate fa-rotate-left fa-rotate-right fa-turn-up
      fa-turn-down fa-left-long-to-line fa-right-long-to-line fa-reply
      fa-reply-all fa-share fa-share-all fa-location-arrow
      fa-compass fa-diamond-turn-right fa-route fa-signs-post
      fa-road fa-road-circle-check fa-person-walking-arrow-right fa-person-walking-arrow-loop-left
      fa-person-walking-luggage fa-arrow-trend-up fa-arrow-trend-down fa-arrow-down-short-wide
      fa-arrow-down-wide-short fa-arrow-up-short-wide fa-arrow-up-wide-short fa-right-left
    `),
  },
  {
    title: '调节',
    icon: lightIcons(`
      fa-plus fa-minus fa-circle-plus fa-circle-minus fa-square-plus fa-square-minus fa-magnifying-glass-plus fa-magnifying-glass-minus fa-plus-large fa-minus-large
      fa-signal fa-signal-bars fa-signal-bars-good fa-signal-bars-fair fa-signal-bars-weak fa-signal-bars-slash fa-circle-0 fa-circle-1 fa-circle-2 fa-circle-3
      fa-circle-4 fa-circle-5 fa-circle-6 fa-circle-7 fa-circle-8 fa-circle-9 fa-sliders fa-sliders-simple fa-sliders-up fa-toggle-off
      fa-toggle-on fa-toggle-large-off fa-toggle-large-on fa-gauge fa-gauge-low fa-gauge-high fa-gauge-min fa-gauge-max fa-gauge-simple fa-gauge-simple-low
      fa-gauge-simple-high fa-gauge-simple-min fa-gauge-simple-max fa-volume-high fa-volume-low fa-volume-off fa-volume-xmark fa-speaker fa-speakers fa-volume-slash
      fa-brightness fa-brightness-low fa-sun-bright fa-arrows-maximize fa-arrows-minimize fa-expand fa-compress fa-expand-wide fa-compress-wide fa-up-right-and-down-left-from-center
      fa-down-left-and-up-right-to-center fa-crop fa-crop-simple fa-filter fa-filter-list fa-filter-circle-xmark fa-filter-circle-dollar fa-sort fa-sort-up fa-sort-down
      fa-arrow-up-a-z fa-arrow-down-a-z fa-arrow-up-1-9 fa-arrow-down-1-9 fa-arrow-up-wide-short fa-arrow-down-wide-short fa-bars-progress fa-chart-simple fa-chart-bar fa-wave-square
      fa-temperature-half fa-temperature-high fa-temperature-low fa-dial fa-dial-high fa-dial-low fa-dial-max fa-dial-min fa-dial-med fa-ruler
      fa-ruler-horizontal fa-ruler-vertical fa-ruler-combined fa-palette fa-swatchbook fa-eye-dropper fa-circle-half-stroke fa-percent fa-calculator fa-abacus
    `),
  },
  {
    title: '开关',
    icon: lightIcons(`
      fa-lock fa-unlock fa-lock-keyhole fa-unlock-keyhole fa-lock-open fa-lock-keyhole-open fa-lock-hashtag fa-lock-a fa-key fa-key-skeleton
      fa-door-closed fa-door-open fa-blinds fa-blinds-open fa-blinds-raised fa-lightbulb fa-lightbulb-on fa-lightbulb-slash fa-light-switch fa-light-switch-on
      fa-light-switch-off fa-lightbulb-cfl fa-lightbulb-cfl-on fa-light-emergency fa-light-emergency-on fa-toggle-off fa-toggle-on fa-toggle-large-off fa-toggle-large-on fa-power-off
      fa-play fa-pause fa-stop fa-play-pause fa-circle-play fa-circle-pause fa-circle-stop fa-forward fa-backward fa-eject
      fa-bell fa-bell-on fa-bell-slash fa-bell-plus fa-bell-exclamation fa-bells fa-siren fa-siren-on fa-alarm-clock fa-clock
      fa-plug fa-plug-circle-bolt fa-plug-circle-check fa-plug-circle-exclamation fa-plug-circle-minus fa-plug-circle-plus fa-plug-circle-xmark fa-outlet fa-battery-full fa-battery-empty
      fa-shield fa-shield-halved fa-shield-check fa-shield-xmark fa-shield-exclamation fa-shield-keyhole fa-shield-plus fa-shield-minus fa-shield-heart fa-shield-slash
      fa-eye fa-eye-slash fa-eye-low-vision fa-eyes fa-microphone fa-microphone-lines fa-microphone-slash fa-microphone-lines-slash fa-microphone-stand fa-radio
      fa-wifi fa-wifi-strong fa-wifi-fair fa-wifi-weak fa-wifi-slash fa-wifi-exclamation fa-bluetooth fa-signal-stream fa-tower-broadcast fa-satellite-dish
      fa-circle-check fa-circle-xmark fa-ban fa-sensor fa-sensor-on fa-sensor-fire fa-sensor-smoke fa-sensor-triangle-exclamation fa-alarm-exclamation fa-alarm-snooze
    `),
  },
  {
    title: '动植物',
    icon: lightIcons(`
      fa-dog fa-dog-leashed fa-cat fa-crow fa-fish fa-fish-bones fa-fish-fins fa-rabbit fa-rabbit-running fa-pig
      fa-ram fa-cow fa-horse fa-horse-head fa-sheep fa-deer fa-deer-rudolph fa-elephant fa-hippo fa-monkey
      fa-squirrel fa-unicorn fa-otter fa-badger-honey fa-bat fa-bird fa-dove fa-duck fa-kiwi-bird fa-turkey
      fa-alicorn fa-cat-space fa-horse-saddle fa-fish-cooked fa-fishing-rod fa-narwhal fa-whale fa-dolphin fa-spider-web fa-bug-slash
      fa-squid fa-paw-simple fa-bone-break fa-crab fa-lobster fa-shrimp fa-frog fa-turtle fa-snake fa-skull-cow
      fa-bee fa-leaf-heart fa-tree-large fa-locust fa-mosquito fa-worm fa-tree-christmas fa-spider fa-spider-black-widow fa-bug
      fa-bugs fa-fly fa-tree-decorated fa-olive fa-tick fa-paw fa-paw-claws fa-claw-marks fa-feather fa-feather-pointed
      fa-seedling fa-tree fa-tree-palm fa-tree-deciduous fa-trees fa-leaf fa-leaf-maple fa-leaf-oak fa-flower fa-flower-tulip
      fa-flower-daffodil fa-cactus fa-olive-branch fa-mushroom fa-clover fa-acorn fa-wheat fa-wheat-awn fa-corn fa-carrot
      fa-apple-whole fa-citrus fa-lemon fa-cherries fa-tomato fa-blueberries fa-strawberry fa-grapes fa-watermelon-slice fa-pumpkin
    `),
  },
  {
    title: '气象',
    icon: lightIcons(`
      fa-sun fa-sun-bright fa-sun-cloud fa-sun-dust fa-sun-haze fa-sunrise fa-sunset fa-moon fa-moon-cloud fa-moon-stars
      fa-moon-over-sun fa-stars fa-star fa-star-shooting fa-meteor fa-comet fa-cloud fa-clouds fa-cloud-sun fa-cloud-moon
      fa-cloud-rain fa-cloud-showers fa-cloud-showers-heavy fa-cloud-sun-rain fa-cloud-moon-rain fa-cloud-drizzle fa-cloud-bolt fa-cloud-bolt-sun fa-cloud-bolt-moon fa-cloud-hail
      fa-cloud-hail-mixed fa-cloud-sleet fa-cloud-snow fa-cloud-fog fa-cloud-rainbow fa-clouds-sun fa-clouds-moon fa-cloud-check fa-cloud-exclamation fa-cloud-question
      fa-cloud-plus fa-cloud-minus fa-cloud-xmark fa-cloud-slash fa-fog fa-smog fa-smoke fa-wind fa-windsock fa-wind-warning
      fa-wind-circle-exclamation fa-wind-turbine fa-tornado fa-hurricane fa-snowflake fa-snowflakes fa-snowflake-droplets fa-snow-blowing fa-snowman fa-icicles
      fa-temperature-empty fa-temperature-quarter fa-temperature-half fa-temperature-three-quarters fa-temperature-full fa-temperature-high fa-temperature-low fa-temperature-arrow-up fa-temperature-arrow-down fa-temperature-snow
      fa-temperature-sun fa-temperature-list fa-heat fa-droplet fa-droplet-degree fa-droplet-percent fa-droplet-slash fa-water fa-water-arrow-up fa-water-arrow-down
      fa-water-rise fa-water-lower fa-wave-sine fa-wave-triangle fa-umbrella fa-umbrella-simple fa-umbrella-beach fa-rainbow fa-bolt fa-bolt-lightning
      fa-volcano fa-mountains fa-mountain-sun fa-fire-smoke fa-house-flood-water fa-house-tsunami fa-radiation fa-biohazard fa-solar-panel fa-globe-snow
    `),
  },
  {
    title: '电器/设备/建筑',
    icon: lightIcons(`
      fa-air-conditioner fa-fan fa-fan-table fa-vacuum fa-refrigerator fa-microwave fa-oven fa-coffee-pot fa-blender fa-washer
      fa-dryer fa-dryer-heat fa-kitchen-set fa-sink fa-faucet fa-faucet-drip fa-toilet fa-shower fa-bath fa-heat
      fa-light-ceiling fa-lamp-floor fa-lamp-desk fa-lamp-street fa-lamp fa-lightbulb fa-light-switch fa-candle-holder fa-flashlight fa-fireplace
      fa-tv fa-tv-retro fa-display fa-desktop fa-laptop fa-tablet-screen-button fa-mobile-screen-button fa-watch-smart fa-radio fa-boombox
      fa-camera fa-camera-retro fa-camera-security fa-webcam fa-video fa-projector fa-speakers fa-speaker fa-headphones fa-microphone
      fa-server fa-database fa-router fa-network-wired fa-wifi fa-ethernet fa-microchip fa-memory fa-hard-drive fa-floppy-disk
      fa-usb-drive fa-plug fa-outlet fa-battery-full fa-charging-station fa-solar-panel fa-meter-bolt fa-sensor fa-meter fa-nfc
      fa-house fa-house-chimney fa-building fa-buildings fa-industry-windows fa-warehouse fa-garage fa-garage-car fa-hospital fa-school
      fa-car fa-bus fa-truck fa-van-shuttle fa-motorcycle fa-bicycle fa-train fa-plane fa-ship fa-rocket
      fa-print fa-scanner fa-fax fa-calculator fa-keyboard fa-computer-mouse fa-gamepad fa-joystick fa-clock fa-gauge-high
    `),
  },
  {
    title: '表情',
    icon: lightIcons(`
      fa-face-angry fa-face-angry-horns fa-face-anguished fa-face-anxious-sweat fa-face-astonished fa-face-awesome fa-face-beam-hand-over-mouth fa-face-clouds fa-face-confounded fa-face-confused
      fa-face-cowboy-hat fa-face-diagonal-mouth fa-face-disappointed fa-face-disguise fa-face-dotted fa-face-downcast-sweat fa-face-drooling fa-face-exhaling fa-face-explode fa-face-expressionless
      fa-face-eyes-xmarks fa-face-fearful fa-face-flushed fa-face-frown-open fa-face-frown-slight fa-face-glasses fa-face-grimace fa-face-grin fa-face-grin-beam fa-face-grin-beam-sweat
      fa-face-grin-hearts fa-face-grin-squint fa-face-grin-squint-tears fa-face-grin-stars fa-face-grin-tears fa-face-grin-tongue fa-face-grin-tongue-squint fa-face-grin-tongue-wink fa-face-grin-wide fa-face-grin-wink
      fa-face-hand-over-mouth fa-face-hand-peeking fa-face-hand-yawn fa-face-head-bandage fa-face-holding-back-tears fa-face-hushed fa-face-icicles fa-face-kiss fa-face-kiss-beam fa-face-kiss-closed-eyes
      fa-face-kiss-wink-heart fa-face-laugh-beam fa-face-laugh-squint fa-face-laugh-wink fa-face-lying fa-face-mask fa-face-melting fa-face-monocle fa-face-nauseated fa-face-nose-steam
      fa-face-party fa-face-pensive fa-face-persevering fa-face-pleading fa-face-pouting fa-face-raised-eyebrow fa-face-relieved fa-face-rolling-eyes fa-face-sad-cry fa-face-sad-sweat
      fa-face-sad-tear fa-face-saluting fa-face-scream fa-face-shush fa-face-sleeping fa-face-sleepy fa-face-smile-beam fa-face-smile-halo fa-face-smile-hearts fa-face-smile-horns
      fa-face-smile-plus fa-face-smile-relaxed fa-face-smile-tear fa-face-smile-tongue fa-face-smile-upside-down
      fa-face-meh-blank fa-face-meh fa-face-surprise fa-face-tired fa-face-dizzy fa-face-frown fa-face-smile fa-face-laugh fa-skull fa-comments fa-comment fa-comment-check fa-comment-dots fa-comment-exclamation fa-comment-smile
    `),
  },
  {
    title: '行为',
    icon: lightIcons(`
      fa-person-arrow-down-to-line fa-person-arrow-up-from-line fa-person-biking fa-person-biking-mountain fa-person-booth fa-person-breastfeeding fa-person-burst fa-person-cane fa-person-carry fa-person-carry-box
      fa-person-chalkboard fa-person-circle-check fa-person-circle-exclamation fa-person-circle-minus fa-person-circle-plus fa-person-circle-question fa-person-circle-xmark fa-person-digging fa-person-dolly fa-person-dolly-empty
      fa-person-dots-from-line fa-person-dress fa-person-dress-burst fa-person-dress-simple fa-person-drowning fa-person-falling fa-person-falling-burst fa-person-from-portal fa-person-half-dress fa-person-harassing
      fa-person-hiking fa-person-military-pointing fa-person-military-rifle fa-person-military-to-person fa-person-pinball fa-person-praying fa-person-pregnant fa-person-rays fa-person-rifle fa-person-running
      fa-person-seat fa-person-seat-reclined fa-person-shelter fa-person-sign fa-person-simple fa-person-skating fa-person-skiing fa-person-skiing-nordic fa-person-ski-jumping fa-person-ski-lift
      fa-person-sledding fa-person-snowboarding fa-person-snowmobiling fa-person-swimming fa-person-through-window fa-person-to-door fa-person-to-portal fa-person-walking fa-person-walking-arrow-loop-left fa-person-walking-arrow-right
      fa-person-walking-dashed-line-arrow-right fa-person-walking-luggage fa-person-walking-with-cane
      fa-house-person-leave fa-house-person-return fa-house-person-arrive fa-house-person-depart fa-bed fa-portal-enter fa-portal-exit fa-hand fa-hand-wave fa-hands
      fa-hands-holding fa-hand-holding fa-handshake fa-handshake-simple fa-hand-point-up fa-hand-point-down fa-hand-point-left fa-hand-point-right fa-thumbs-up fa-thumbs-down
      fa-hands-clapping fa-hands-praying fa-hand-fist fa-hand-peace fa-hand-back-fist fa-hand-pointer fa-user fa-user-plus fa-user-minus fa-user-check
      fa-user-xmark fa-user-clock fa-user-gear fa-user-pen fa-users fa-users-between-lines fa-child-reaching
    `),
  },
  {
    title: '其他',
    icon: lightIcons(`
      fa-fire-flame-curved fa-droplet fa-leaf fa-heart-pulse fa-arrow-rotate-right fa-repeat fa-arrows-rotate fa-database fa-chart-network fa-power-off fa-dna fa-user-robot fa-atom fa-hands-asl-interpreting fa-gears fa-handshake-simple fa-map-location-dot fa-link fa-route
      fa-star fa-heart fa-flag fa-bookmark fa-tag fa-tags fa-thumbtack fa-paperclip fa-scissors fa-pen fa-pencil fa-eraser fa-paintbrush fa-palette fa-ruler fa-hammer fa-wrench fa-screwdriver fa-toolbox fa-gear
      fa-info fa-circle-info fa-question fa-circle-question fa-exclamation fa-circle-exclamation fa-triangle-exclamation fa-check fa-circle-check fa-xmark fa-circle-xmark fa-plus fa-minus fa-ban fa-shield-check
      fa-calendar fa-calendar-days fa-clock fa-stopwatch fa-hourglass fa-bell fa-envelope fa-inbox fa-paper-plane fa-comment fa-comments fa-phone fa-address-book fa-user fa-users
      fa-folder fa-folder-open fa-file fa-file-lines fa-file-pdf fa-file-image fa-file-code fa-clipboard fa-copy fa-floppy-disk fa-trash-can fa-download fa-upload fa-cloud-arrow-down fa-cloud-arrow-up
      fa-globe fa-earth-americas fa-location-dot fa-compass fa-road fa-car fa-train fa-plane fa-ship fa-rocket fa-bicycle fa-person-walking fa-wifi fa-bluetooth fa-signal fa-qrcode
    `),
  },
];
