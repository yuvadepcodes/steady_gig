import { WeeklyEarningsRecord } from './financial-calendar';

export type DemandColor = 'RED' | 'YELLOW' | 'GREEN';

export const CALENDAR_COLORS = {
  RED: '#EF4444',
  YELLOW: '#FACC15',
  GREEN: '#22C55E',
  PURPLE: '#A855F7',
  BLUE: '#3B82F6',
} as const;

export interface WeekSlotData {
  weekNumber: 1 | 2 | 3 | 4 | 5;
  label: string; // e.g. 'W1 (1–7)'
  startDay: number;
  endDay: number;
  demandLevel: 'Low' | 'Medium' | 'High';
  demandColor: DemandColor;
  hasFestival: boolean;
  hasWeatherAlert: boolean;
  summary: string;
}

export interface MonthCalendarPlan {
  id: string; // '2026-12' .. '2027-12'
  year: number;
  monthIndex: number; // 0-11
  monthName: string; // e.g. 'December 2026'
  shortMonth: string; // e.g. 'DEC 2026'
  season: string;
  rainfallNormalMm: number;
  weatherAlertSummary: string;
  ridingConditionLevel: 'Dry' | 'Heat' | 'Pre-Monsoon' | 'Monsoon' | 'Heavy Monsoon';
  driverAlert: string;
  weeks: WeekSlotData[];
}

export interface FestivalEvent {
  id: string;
  dateISO: string; // 'YYYY-MM-DD'
  name: string;
  type: 'festival' | 'holiday' | 'islamic';
  tentative: boolean;
  demandNote: string;
}

export interface PlatformIncentive {
  id: string;
  platformName: string;
  applicableDate: string; // 'YYYY-MM-DD'
  timeWindow: string; // e.g. '6 PM–12 AM'
  ordersRequired: number | null;
  minEarningsCondition: string;
  bonusAmount: number | null;
  rainOrSurgeBonus: string;
  eligibilityConditions: string;
  expiryDate: string;
  verifiedByRider: boolean;
  statusNote: string;
}

export interface DayInsight {
  dateISO: string;
  dayNumber: number;
  weekdayIndex: number; // 0 Sun .. 6 Sat
  weekdayName: string;
  weekSlot: WeekSlotData;
  demandLevel: 'Low' | 'Medium' | 'High';
  demandColor: DemandColor;
  festivals: FestivalEvent[];
  hasFestival: boolean;
  hasWeatherAlert: boolean;
  weatherCondition: string;
  rainfallRisk: string;
  rainfallNormalMm: number;
  peakDeliveryHours: string[];
  verifiedIncentives: PlatformIncentive[];
  unverifiedIncentives: PlatformIncentive[];
  estimatedIncomeLow: number;
  estimatedIncomeHigh: number;
  estimatedFuelAndMaintenance: number;
  recommendedSavings: number;
  safetyWarning: string | null;
  recommendation: string;
  actualEarned: number | null;
  actualOrderPayout: number | null;
  actualIncentives: number | null;
  actualCompletedOrders: number | null;
  actualSingleRuns: number | null;
  actualMultiRuns: number | null;
  actualExcludedOrders: number | null;
  actualDetailNote: string | null;
  actualSource: 'screenshot' | 'supabase' | 'custom' | null;
  weekEarnedSummary: {
    weekLabel: string;
    totalEarnings: number;
    orderPayout: number;
    incentives: number;
    lateNightIncentive: number;
    totalOrders: number;
    singleRuns: number;
    multiRuns: number;
    targetCompleted: boolean;
  } | null;
}

export const BENGALURU_13_MONTH_PLAN: MonthCalendarPlan[] = [
  {
    id: '2026-10',
    year: 2026,
    monthIndex: 9,
    monthName: 'October 2026',
    shortMonth: 'OCTOBER 2026',
    season: 'Post-monsoon / rainy festive season',
    rainfallNormalMm: 186.4,
    weatherAlertSummary: 'Higher rainfall & evening waterlogging risk; festive orders peak around Dussehra.',
    ridingConditionLevel: 'Heavy Monsoon',
    driverAlert: 'Actual screenshot logged ₹3,678 (Oct 19–25, 103 orders). Watch weekend spikes (₹1,110 Sat, ₹1,588 Sun) vs slower midweek shifts.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Gandhi Jayanti on 2 October.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: true, summary: 'Pre-Dussehra weekend & monsoon evening orders.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Ayudha Puja (19 Oct) & Dussehra (20 Oct); actual ₹220/₹250/₹90 logged Oct 19–21.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: true, summary: 'Actual ₹3,118 earned Oct 22–25 (Sat ₹1,110 + Sun ₹1,588); ₹3,678 weekly total.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Month-end & pre-Rajyotsava weekend orders.' },
    ],
  },
  {
    id: '2026-11',
    year: 2026,
    monthIndex: 10,
    monthName: 'November 2026',
    shortMonth: 'NOVEMBER 2026',
    season: 'Post-monsoon / relatively cooler weather',
    rainfallNormalMm: 64.5,
    weatherAlertSummary: 'Relatively dry riding conditions; cool evenings after festive season.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'Actual screenshot logged ₹10,712 (Nov 09–15, 308 orders: ₹7,660 payout + ₹3,052 incentives). Sunday hit ₹4,062.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Karnataka Rajyotsava on 1 November.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Deepavali & strong Nov 09–14 streak (₹1,010–₹1,190/day logged).' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Sun Nov 15 hit ₹4,062 (₹10,712 week); Kanakadasa Jayanti on 16 Nov.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Normal weekend demand.' },
      { weekNumber: 5, label: 'W5 (29–30)', startDay: 29, endDay: 30, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Month-end regular demand.' },
    ],
  },
  {
    id: '2026-12',
    year: 2026,
    monthIndex: 11,
    monthName: 'December 2026',
    shortMonth: 'DECEMBER 2026',
    season: 'Winter / relatively dry weather',
    rainfallNormalMm: 15.4,
    weatherAlertSummary: 'Relatively dry riding conditions; cool evenings.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'Look for year-end bonuses and save additional earnings for January.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular food delivery demand.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal weekday and weekend activity.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Christmas preparations and weekend orders.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Christmas on 25 December; celebrations and group orders.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: "New Year's Eve preparations and potentially higher incentives." },
    ],
  },
  {
    id: '2027-01',
    year: 2027,
    monthIndex: 0,
    monthName: 'January 2027',
    shortMonth: 'JANUARY 2027',
    season: 'Cool and dry',
    rainfallNormalMm: 1.6,
    weatherAlertSummary: 'Relatively dry riding conditions across Bengaluru.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'Expect normal weather-related operating conditions, but monitor weekend and festival incentives.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'New Year celebrations on 1 January.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Makar Sankranti/Pongal on 15 January.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Republic Day on 26 January and holiday orders.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular demand.' },
    ],
  },
  {
    id: '2027-02',
    year: 2027,
    monthIndex: 1,
    monthName: 'February 2027',
    shortMonth: 'FEBRUARY 2027',
    season: 'Dry and warming',
    rainfallNormalMm: 7.1,
    weatherAlertSummary: 'Relatively dry riding conditions; afternoon temperatures rise.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'Heat begins increasing. Maintain hydration and vehicle checks.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: "Valentine's Day on 14 February." },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular orders.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
    ],
  },
  {
    id: '2027-03',
    year: 2027,
    monthIndex: 2,
    monthName: 'March 2027',
    shortMonth: 'MARCH 2027',
    season: 'Summer begins',
    rainfallNormalMm: 14.7,
    weatherAlertSummary: 'Heat and dehydration warnings during afternoon shifts.',
    ridingConditionLevel: 'Heat',
    driverAlert: 'High temperatures may affect working hours and rider productivity.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Maha Shivaratri on 6 March.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Ramzan Eid around 10 March, subject to moon sighting.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: false, summary: 'Festival and weekend activity.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Holi around 21–22 March; Good Friday on 26 March.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Post-festival normalisation.' },
    ],
  },
  {
    id: '2027-04',
    year: 2027,
    monthIndex: 3,
    monthName: 'April 2027',
    shortMonth: 'APRIL 2027',
    season: 'Hot summer / pre-monsoon showers',
    rainfallNormalMm: 61.7,
    weatherAlertSummary: 'Heat & dehydration warnings + occasional pre-monsoon thunderstorms.',
    ridingConditionLevel: 'Pre-Monsoon',
    driverAlert: 'Heat exposure, dehydration and occasional thunderstorms.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: true, summary: 'Ugadi on 7 April.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Ambedkar Jayanti on 14 April.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Rama Navami around 15 April; Mahaveer Jayanti on 18 April.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: true, summary: 'Regular summer and weekend orders.' },
      { weekNumber: 5, label: 'W5 (29–30)', startDay: 29, endDay: 30, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular demand.' },
    ],
  },
  {
    id: '2027-05',
    year: 2027,
    monthIndex: 4,
    monthName: 'May 2027',
    shortMonth: 'MAY 2027',
    season: 'Hot summer / pre-monsoon rain',
    rainfallNormalMm: 128.7,
    weatherAlertSummary: 'Heat warnings + pre-monsoon evening thunderstorms in Bengaluru.',
    ridingConditionLevel: 'Pre-Monsoon',
    driverAlert: 'Check whether the platform offers heat-related or peak-hour bonuses. Do not assume these are guaranteed.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'May Day on 1 May.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: true, summary: 'Regular weekend and summer demand.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Bakrid on 17 May.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Summer and possible rain disruptions.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
    ],
  },
  {
    id: '2027-06',
    year: 2027,
    monthIndex: 5,
    monthName: 'June 2027',
    shortMonth: 'JUNE 2027',
    season: 'Southwest monsoon begins',
    rainfallNormalMm: 110.3,
    weatherAlertSummary: 'Monsoon onset; slippery roads and slower traffic.',
    ridingConditionLevel: 'Monsoon',
    driverAlert: 'Monitor road conditions, fuel expenses and delivery delays.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Rain and traffic disruption risk.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: true, summary: 'Muharram around 16 June; possible rain disruption.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Monsoon and slower delivery conditions.' },
      { weekNumber: 5, label: 'W5 (29–30)', startDay: 29, endDay: 30, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular demand.' },
    ],
  },
  {
    id: '2027-07',
    year: 2027,
    monthIndex: 6,
    monthName: 'July 2027',
    shortMonth: 'JULY 2027',
    season: 'Southwest monsoon',
    rainfallNormalMm: 116.4,
    weatherAlertSummary: 'Monsoon showers and slippery road surfaces.',
    ridingConditionLevel: 'Monsoon',
    driverAlert: 'Set aside money for vehicle maintenance and unexpected repairs.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Rain-related delays.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Regular demand with weather disruption.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Weekend and regular orders.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Heavy rain possibilities.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
    ],
  },
  {
    id: '2027-08',
    year: 2027,
    monthIndex: 7,
    monthName: 'August 2027',
    shortMonth: 'AUGUST 2027',
    season: 'Monsoon',
    rainfallNormalMm: 162.7,
    weatherAlertSummary: 'Active monsoon showers; monitor slippery stretches & rain gear.',
    ridingConditionLevel: 'Monsoon',
    driverAlert: 'Festivals may create earning opportunities, but monitor rainfall and road safety.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Rain-related disruptions.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Varalakshmi Vrata on 13 August.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Independence Day on 15 August; Raksha Bandhan on 17 August.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Krishna Janmashtami on 24 August.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Normal demand.' },
    ],
  },
  {
    id: '2027-09',
    year: 2027,
    monthIndex: 8,
    monthName: 'September 2027',
    shortMonth: 'SEPTEMBER 2027',
    season: 'Heavy monsoon',
    rainfallNormalMm: 208.3,
    weatherAlertSummary: 'Highest rainfall normal (208.3 mm); waterlogging and slippery road risk.',
    ridingConditionLevel: 'Heavy Monsoon',
    driverAlert: 'Heavy rainfall can increase customer demand but reduce completed deliveries per hour. Prioritise safety.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: true, summary: 'Swarna Gowri Vrata on 3 September and Ganesh Chaturthi on 4 September.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Continued monsoon and regular orders.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: true, summary: 'Regular demand and rain disruption.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: true, summary: 'Festival-related activity.' },
      { weekNumber: 5, label: 'W5 (29–30)', startDay: 29, endDay: 30, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: true, hasWeatherAlert: true, summary: 'Mahalaya Amavasya on 29 September.' },
    ],
  },
  {
    id: '2027-10',
    year: 2027,
    monthIndex: 9,
    monthName: 'October 2027',
    shortMonth: 'OCTOBER 2027',
    season: 'Post-monsoon / rainy festive season',
    rainfallNormalMm: 186.4,
    weatherAlertSummary: 'Higher rainfall and evening waterlogging risk across key junctions.',
    ridingConditionLevel: 'Heavy Monsoon',
    driverAlert: 'Potentially high festive demand. Check platform bonus announcements and plan rest periods.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Gandhi Jayanti on 2 October.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Dussehra and Ayudha Puja around 9–10 October.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Valmiki Jayanti on 15 October.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: true, summary: 'Dhanteras around 27 October and Naraka Chaturdashi on 28 October.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Deepavali on 30 October.' },
    ],
  },
  {
    id: '2027-11',
    year: 2027,
    monthIndex: 10,
    monthName: 'November 2027',
    shortMonth: 'NOVEMBER 2027',
    season: 'Post-monsoon / relatively cooler weather',
    rainfallNormalMm: 64.5,
    weatherAlertSummary: 'Relatively dry riding conditions; occasional early-month showers.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'After festive spending, prepare for normal or potentially slower periods.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Karnataka Rajyotsava on 1 November.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Weekend and regular demand.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Kanakadasa Jayanti on 16 November.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Normal weekend demand.' },
      { weekNumber: 5, label: 'W5 (29–30)', startDay: 29, endDay: 30, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular demand.' },
    ],
  },
  {
    id: '2027-12',
    year: 2027,
    monthIndex: 11,
    monthName: 'December 2027',
    shortMonth: 'DECEMBER 2027',
    season: 'Winter / dry weather',
    rainfallNormalMm: 15.4,
    weatherAlertSummary: 'Relatively dry riding conditions.',
    ridingConditionLevel: 'Dry',
    driverAlert: 'Monitor year-end incentives and save for the beginning of the next year.',
    weeks: [
      { weekNumber: 1, label: 'W1 (1–7)', startDay: 1, endDay: 7, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Regular demand.' },
      { weekNumber: 2, label: 'W2 (8–14)', startDay: 8, endDay: 14, demandLevel: 'Medium', demandColor: 'YELLOW', hasFestival: false, hasWeatherAlert: false, summary: 'Weekend orders and local events.' },
      { weekNumber: 3, label: 'W3 (15–21)', startDay: 15, endDay: 21, demandLevel: 'High', demandColor: 'GREEN', hasFestival: false, hasWeatherAlert: false, summary: 'Christmas preparations.' },
      { weekNumber: 4, label: 'W4 (22–28)', startDay: 22, endDay: 28, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: 'Christmas on 25 December.' },
      { weekNumber: 5, label: 'W5 (29–31)', startDay: 29, endDay: 31, demandLevel: 'High', demandColor: 'GREEN', hasFestival: true, hasWeatherAlert: false, summary: "New Year's Eve and year-end celebrations." },
    ],
  },
];

// 12-month rolling year starting October 2026 through September 2027 (3 rows of 4 months desktop, 4 rows of 3 months phone)
export const BENGALURU_12_MONTH_PLAN: MonthCalendarPlan[] = BENGALURU_13_MONTH_PLAN.slice(0, 12);

export const INITIAL_FESTIVAL_EVENTS: FestivalEvent[] = [
  { id: 'fest-2026-10-02', dateISO: '2026-10-02', name: 'Gandhi Jayanti', type: 'holiday', tentative: false, demandNote: 'Public holiday across Bengaluru' },
  { id: 'fest-2026-10-15', dateISO: '2026-10-15', name: 'Valmiki Jayanti', type: 'holiday', tentative: false, demandNote: 'Karnataka regional holiday' },
  { id: 'fest-2026-10-19', dateISO: '2026-10-19', name: 'Ayudha Puja', type: 'festival', tentative: false, demandNote: 'Vehicle & shop pujas; rider earned ₹220 (7 single, 1 multi, 2 cancelled)' },
  { id: 'fest-2026-10-20', dateISO: '2026-10-20', name: 'Dussehra (Vijayadashami)', type: 'festival', tentative: false, demandNote: 'Festive family celebrations; rider earned ₹250' },
  { id: 'fest-2026-11-01', dateISO: '2026-11-01', name: 'Karnataka Rajyotsava', type: 'holiday', tentative: false, demandNote: 'State holiday across Bengaluru' },
  { id: 'fest-2026-11-08', dateISO: '2026-11-08', name: 'Deepavali Celebration', type: 'festival', tentative: false, demandNote: 'Festive sweet & family dinner peak' },
  { id: 'fest-2026-11-16', dateISO: '2026-11-16', name: 'Kanakadasa Jayanti', type: 'holiday', tentative: false, demandNote: 'Regional holiday orders' },
  { id: 'fest-2026-12-25', dateISO: '2026-12-25', name: 'Christmas Day', type: 'festival', tentative: false, demandNote: 'Celebrations and group dinner orders' },
  { id: 'fest-2026-12-31', dateISO: '2026-12-31', name: "New Year's Eve", type: 'festival', tentative: false, demandNote: 'Late-evening party & family orders' },
  { id: 'fest-2027-01-01', dateISO: '2027-01-01', name: 'New Year Celebrations', type: 'holiday', tentative: false, demandNote: 'Holiday brunch & evening orders' },
  { id: 'fest-2027-01-15', dateISO: '2027-01-15', name: 'Makar Sankranti / Pongal', type: 'festival', tentative: false, demandNote: 'Regional festive lunch & sweet orders' },
  { id: 'fest-2027-01-26', dateISO: '2027-01-26', name: 'Republic Day', type: 'holiday', tentative: false, demandNote: 'Public holiday home deliveries' },
  { id: 'fest-2027-02-14', dateISO: '2027-02-14', name: "Valentine's Day", type: 'festival', tentative: false, demandNote: 'Evening dessert, bakery & dinner orders' },
  { id: 'fest-2027-03-06', dateISO: '2027-03-06', name: 'Maha Shivaratri', type: 'festival', tentative: false, demandNote: 'Fasting/vegetarian dinner & late-night demand' },
  { id: 'fest-2027-03-10', dateISO: '2027-03-10', name: 'Ramzan Eid (Eid-ul-Fitr)', type: 'islamic', tentative: true, demandNote: 'Subject to official moon sighting' },
  { id: 'fest-2027-03-21', dateISO: '2027-03-21', name: 'Holi Eve (Holika Dahan)', type: 'festival', tentative: true, demandNote: 'Approximate lunar date' },
  { id: 'fest-2027-03-22', dateISO: '2027-03-22', name: 'Holi', type: 'festival', tentative: true, demandNote: 'Daytime celebration & evening snacks' },
  { id: 'fest-2027-03-26', dateISO: '2027-03-26', name: 'Good Friday', type: 'holiday', tentative: false, demandNote: 'Long-weekend dining demand' },
  { id: 'fest-2027-04-07', dateISO: '2027-04-07', name: 'Ugadi', type: 'festival', tentative: false, demandNote: 'Karnataka New Year festive dining' },
  { id: 'fest-2027-04-14', dateISO: '2027-04-14', name: 'Ambedkar Jayanti', type: 'holiday', tentative: false, demandNote: 'Public holiday order volume' },
  { id: 'fest-2027-04-15', dateISO: '2027-04-15', name: 'Rama Navami', type: 'festival', tentative: true, demandNote: 'Approximate lunar calendar date' },
  { id: 'fest-2027-04-18', dateISO: '2027-04-18', name: 'Mahaveer Jayanti', type: 'festival', tentative: false, demandNote: 'Sunday festive overlap' },
  { id: 'fest-2027-05-01', dateISO: '2027-05-01', name: 'May Day', type: 'holiday', tentative: false, demandNote: 'Weekend holiday orders' },
  { id: 'fest-2027-05-17', dateISO: '2027-05-17', name: 'Bakrid (Eid-ul-Adha)', type: 'islamic', tentative: true, demandNote: 'Subject to official moon sighting' },
  { id: 'fest-2027-06-16', dateISO: '2027-06-16', name: 'Muharram', type: 'islamic', tentative: true, demandNote: 'Subject to official moon sighting' },
  { id: 'fest-2027-08-13', dateISO: '2027-08-13', name: 'Varalakshmi Vrata', type: 'festival', tentative: false, demandNote: 'Friday festive & family orders' },
  { id: 'fest-2027-08-15', dateISO: '2027-08-15', name: 'Independence Day', type: 'holiday', tentative: false, demandNote: 'Sunday public holiday orders' },
  { id: 'fest-2027-08-17', dateISO: '2027-08-17', name: 'Raksha Bandhan', type: 'festival', tentative: false, demandNote: 'Sweet & family celebration deliveries' },
  { id: 'fest-2027-08-24', dateISO: '2027-08-24', name: 'Krishna Janmashtami', type: 'festival', tentative: false, demandNote: 'Evening snacks & dessert orders' },
  { id: 'fest-2027-09-03', dateISO: '2027-09-03', name: 'Swarna Gowri Vrata', type: 'festival', tentative: false, demandNote: 'Festive preparations across Bengaluru' },
  { id: 'fest-2027-09-04', dateISO: '2027-09-04', name: 'Ganesh Chaturthi', type: 'festival', tentative: false, demandNote: 'Heavy monsoon + high festive home orders' },
  { id: 'fest-2027-09-29', dateISO: '2027-09-29', name: 'Mahalaya Amavasya', type: 'festival', tentative: false, demandNote: 'Pre-Navaratri observance' },
  { id: 'fest-2027-10-02', dateISO: '2027-10-02', name: 'Gandhi Jayanti', type: 'holiday', tentative: false, demandNote: 'Saturday public holiday orders' },
  { id: 'fest-2027-10-09', dateISO: '2027-10-09', name: 'Ayudha Puja', type: 'festival', tentative: true, demandNote: 'Around 9–10 October; vehicle & shop pujas' },
  { id: 'fest-2027-10-10', dateISO: '2027-10-10', name: 'Dussehra (Vijayadashami)', type: 'festival', tentative: true, demandNote: 'Festive family celebrations' },
  { id: 'fest-2027-10-15', dateISO: '2027-10-15', name: 'Valmiki Jayanti', type: 'holiday', tentative: false, demandNote: 'Friday regional holiday' },
  { id: 'fest-2027-10-27', dateISO: '2027-10-27', name: 'Dhanteras', type: 'festival', tentative: true, demandNote: 'Festive shopping & evening dining' },
  { id: 'fest-2027-10-28', dateISO: '2027-10-28', name: 'Naraka Chaturdashi', type: 'festival', tentative: false, demandNote: 'Festival demand: Potentially high' },
  { id: 'fest-2027-10-30', dateISO: '2027-10-30', name: 'Deepavali', type: 'festival', tentative: false, demandNote: 'Saturday Deepavali peak + sweet/dinner deliveries' },
  { id: 'fest-2027-11-01', dateISO: '2027-11-01', name: 'Karnataka Rajyotsava', type: 'holiday', tentative: false, demandNote: 'State holiday across Bengaluru' },
  { id: 'fest-2027-11-16', dateISO: '2027-11-16', name: 'Kanakadasa Jayanti', type: 'holiday', tentative: false, demandNote: 'Regional holiday orders' },
  { id: 'fest-2027-12-25', dateISO: '2027-12-25', name: 'Christmas Day', type: 'festival', tentative: false, demandNote: 'Saturday Christmas celebrations' },
  { id: 'fest-2027-12-31', dateISO: '2027-12-31', name: "New Year's Eve", type: 'festival', tentative: false, demandNote: 'Year-end peak evening orders' },
];

export const INITIAL_INCENTIVES: PlatformIncentive[] = [
  {
    id: 'inc-sample-nye-2026',
    platformName: 'Swiggy',
    applicableDate: '2026-12-31',
    timeWindow: '6 PM–12 AM',
    ordersRequired: null,
    minEarningsCondition: 'Peak-hour incentive (check offer card)',
    bonusAmount: null,
    rainOrSurgeBonus: 'Check app for live surge multiplier',
    eligibilityConditions: 'Maintain minimum acceptance & login hours',
    expiryDate: '2026-12-31',
    verifiedByRider: false,
    statusNote: 'Check actual rider app offer.',
  },
];

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function getWeekSlotForDay(month: MonthCalendarPlan, day: number): WeekSlotData {
  const found = month.weeks.find((w) => day >= w.startDay && day <= w.endDay);
  return found || month.weeks[month.weeks.length - 1];
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function getFirstWeekdayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex, 1)).getUTCDay(); // 0=Sun .. 6=Sat
}

export const SCREENSHOT_DAY_DETAILS: Record<
  string,
  {
    singleRuns: number;
    multiRuns: number;
    excludedOrders: number;
    note: string;
  }
> = {
  '2026-10-19': {
    singleRuns: 7,
    multiRuns: 1,
    excludedOrders: 2,
    note: 'Order Payout screenshot: 7 Single Runs, 1 Multi Run, 2 Excluded (#246 & #243 cancelled ₹0.0); ₹30.0/completed order.',
  },
  '2026-11-09': {
    singleRuns: 35,
    multiRuns: 14,
    excludedOrders: 2,
    note: 'Order Payout screenshot: 35 Single Runs, 14 Multi Runs, 2 Excluded (#344 cancelled ₹0.0); ₹30.0/completed order.',
  },
};

export interface MonthActualEarningsSummary {
  totalEarned: number;
  orderPayout: number;
  incentives: number;
  totalOrders: number;
  singleRuns: number;
  multiRuns: number;
  recordedDaysCount: number;
  weeksCount: number;
}

export function getMonthActualEarningsSummary(
  monthId: string,
  historicalWeeks: WeeklyEarningsRecord[]
): MonthActualEarningsSummary | null {
  let totalEarned = 0;
  let orderPayout = 0;
  let incentives = 0;
  let totalOrders = 0;
  let singleRuns = 0;
  let multiRuns = 0;
  let recordedDaysCount = 0;
  const matchedWeekIds = new Set<string>();

  for (const wk of historicalWeeks) {
    for (const day of wk.days) {
      if (day.dateISO.startsWith(monthId)) {
        totalEarned += day.actualEarnings;
        orderPayout += day.orderPayout;
        incentives += day.incentives;
        totalOrders += day.completedOrders;
        singleRuns += day.singleRuns;
        multiRuns += day.multiRuns;
        recordedDaysCount += 1;
        matchedWeekIds.add(wk.id);
      }
    }
  }

  if (recordedDaysCount === 0) return null;
  return {
    totalEarned,
    orderPayout,
    incentives,
    totalOrders,
    singleRuns,
    multiRuns,
    recordedDaysCount,
    weeksCount: matchedWeekIds.size,
  };
}

export function buildDayInsight(params: {
  month: MonthCalendarPlan;
  dayNumber: number;
  festivals: FestivalEvent[];
  incentives: PlatformIncentive[];
  historicalWeeks: WeeklyEarningsRecord[];
}): DayInsight {
  const { month, dayNumber, festivals, incentives, historicalWeeks } = params;
  const mm = String(month.monthIndex + 1).padStart(2, '0');
  const dd = String(dayNumber).padStart(2, '0');
  const dateISO = `${month.year}-${mm}-${dd}`;
  const weekdayIndex = new Date(Date.UTC(month.year, month.monthIndex, dayNumber)).getUTCDay();
  const weekdayName = WEEKDAY_NAMES[weekdayIndex];
  const weekSlot = getWeekSlotForDay(month, dayNumber);

  const dayFestivals = festivals.filter((f) => f.dateISO === dateISO);
  const hasFestival = dayFestivals.length > 0;
  const hasWeatherAlert = weekSlot.hasWeatherAlert || month.rainfallNormalMm >= 100;

  // Combine weekly demand with baseline weekday demand rules (Section E)
  let demandLevel: 'Low' | 'Medium' | 'High' = weekSlot.demandLevel;
  let demandColor: DemandColor = weekSlot.demandColor;

  if (weekdayIndex === 0 || weekdayIndex === 6) {
    // Saturday & Sunday: Very high demand potential
    demandLevel = 'High';
    demandColor = 'GREEN';
  } else if (weekdayIndex === 5 && weekSlot.demandColor !== 'RED') {
    // Friday: High evening demand
    demandLevel = 'High';
    demandColor = 'GREEN';
  } else if ((weekdayIndex === 1 || weekdayIndex === 2) && weekSlot.demandColor === 'YELLOW' && !hasFestival) {
    // Monday-Tuesday: Medium or relatively lower demand
    demandLevel = month.rainfallNormalMm >= 160 ? 'Low' : 'Medium';
    demandColor = month.rainfallNormalMm >= 160 ? 'RED' : 'YELLOW';
  }

  // Derive historical baseline anchor from actual uploaded rider records (Oct + Nov + logged)
  const avgWeeklyActual =
    historicalWeeks.length > 0
      ? historicalWeeks.reduce((sum, w) => sum + w.totalEarnings, 0) / historicalWeeks.length
      : 7195;
  const avgDailyActual = Math.round(avgWeeklyActual / 7);

  // Weekday multiplier anchored on observed patterns (Mon-Tue softer, Sat-Sun stronger)
  const weekdayMultiplier =
    weekdayIndex === 0
      ? 1.55
      : weekdayIndex === 6
      ? 1.25
      : weekdayIndex === 5
      ? 1.05
      : weekdayIndex === 1 || weekdayIndex === 2
      ? 0.72
      : 0.85;

  const demandMultiplier =
    demandLevel === 'High' ? 1.15 : demandLevel === 'Low' ? 0.78 : 0.95;

  const centerEst = Math.round(avgDailyActual * weekdayMultiplier * demandMultiplier);
  const estimatedIncomeLow = Math.max(250, Math.round(centerEst * 0.8));
  const estimatedIncomeHigh = Math.max(estimatedIncomeLow + 200, Math.round(centerEst * 1.25));

  // Fuel & maintenance higher during monsoon/heavy rain or high-order weekend days
  const baseWorkCost = demandLevel === 'High' ? 270 : 170;
  const monsoonMaintenance = month.rainfallNormalMm >= 100 ? 65 : 25;
  const estimatedFuelAndMaintenance = baseWorkCost + monsoonMaintenance;

  // Recommended savings based on estimated net after fuel/maintenance
  const estimatedNet = Math.max(0, centerEst - estimatedFuelAndMaintenance);
  const recommendedSavings =
    demandLevel === 'High'
      ? Math.round(estimatedNet * 0.18)
      : demandLevel === 'Medium'
      ? Math.round(estimatedNet * 0.1)
      : 0;

  const dayIncentives = incentives.filter((inc) => inc.applicableDate === dateISO);
  const verifiedIncentives = dayIncentives.filter((inc) => inc.verifiedByRider);
  const unverifiedIncentives = dayIncentives.filter((inc) => !inc.verifiedByRider);

  // Peak delivery hours (Section E)
  const peakDeliveryHours =
    weekdayIndex === 0 || weekdayIndex === 6 || hasFestival
      ? ['12 PM–2 PM (Lunch)', '5 PM–7 PM (Snacks)', '7 PM–10 PM (Dinner Peak)']
      : weekdayIndex === 5
      ? ['12 PM–2 PM (Lunch)', '7 PM–10 PM (Friday Dinner Peak)']
      : ['7 AM–10 AM (Breakfast)', '12 PM–2 PM (Lunch)', '7 PM–10 PM (Dinner)'];

  // Weather & safety warning (Section C & F)
  let rainfallRisk = 'Low rainfall risk (Dry conditions)';
  if (month.rainfallNormalMm >= 180) {
    rainfallRisk = `High rainfall & waterlogging risk (IMD normal ${month.rainfallNormalMm} mm)`;
  } else if (month.rainfallNormalMm >= 100) {
    rainfallRisk = `Moderate-high monsoon risk (IMD normal ${month.rainfallNormalMm} mm)`;
  } else if (month.rainfallNormalMm >= 50) {
    rainfallRisk = `Pre-monsoon / occasional shower risk (IMD normal ${month.rainfallNormalMm} mm)`;
  }

  let safetyWarning: string | null = null;
  if (month.ridingConditionLevel === 'Heavy Monsoon') {
    safetyWarning = 'Heavy rain/waterlogging possible. Slow down on flooded stretches and protect phone/brakes.';
  } else if (month.ridingConditionLevel === 'Monsoon' || weekSlot.hasWeatherAlert) {
    safetyWarning = 'Check live weather radar before evening dinner shifts; budget extra for brake/tyre wear.';
  } else if (month.ridingConditionLevel === 'Heat' || month.ridingConditionLevel === 'Pre-Monsoon') {
    safetyWarning = 'Carry water and take shade breaks between 1 PM–4 PM; watch for sudden evening storms.';
  }

  const recommendation =
    demandLevel === 'High'
      ? `Plan your working hours around ${weekdayIndex === 0 || weekdayIndex === 6 ? 'lunch and dinner peaks (12–2 PM & 7–10 PM)' : 'dinner peaks (7–10 PM)'} and save ~₹${recommendedSavings.toLocaleString('en-IN')} for slower weekdays.`
      : demandLevel === 'Low'
      ? 'Lower expected demand period. Keep non-essential spend minimal and lean on reserve savings only if needed.'
      : `Steady ${weekdayName} shift. Focus on lunch (12–2 PM) & dinner (7–10 PM) slots and set aside ~₹${recommendedSavings.toLocaleString('en-IN')}.`;

  // Match actual recorded earnings from driver screenshots / Supabase logs
  let matchedWeek: WeeklyEarningsRecord | null = null;
  let matchedDay: WeeklyEarningsRecord['days'][number] | null = null;
  for (const wk of historicalWeeks) {
    const found = wk.days.find((d) => d.dateISO === dateISO);
    if (found) {
      matchedWeek = wk;
      matchedDay = found;
      break;
    }
  }

  const screenshotMeta = SCREENSHOT_DAY_DETAILS[dateISO];
  const actualEarned = matchedDay ? matchedDay.actualEarnings : null;
  const actualOrderPayout = matchedDay ? matchedDay.orderPayout : null;
  const actualIncentives = matchedDay ? matchedDay.incentives : null;
  const actualCompletedOrders = matchedDay ? matchedDay.completedOrders : null;
  const actualSingleRuns = screenshotMeta
    ? screenshotMeta.singleRuns
    : matchedDay
    ? matchedDay.singleRuns
    : null;
  const actualMultiRuns = screenshotMeta
    ? screenshotMeta.multiRuns
    : matchedDay
    ? matchedDay.multiRuns
    : null;
  const actualExcludedOrders = screenshotMeta ? screenshotMeta.excludedOrders : null;
  const actualDetailNote = screenshotMeta
    ? screenshotMeta.note
    : matchedDay
    ? matchedDay.historicalReference
    : null;
  const actualSource = matchedWeek ? matchedWeek.source : null;
  const weekEarnedSummary = matchedWeek
    ? {
        weekLabel: matchedWeek.weekLabel,
        totalEarnings: matchedWeek.totalEarnings,
        orderPayout: matchedWeek.orderPayout,
        incentives: matchedWeek.incentives,
        lateNightIncentive: matchedWeek.lateNightIncentive,
        totalOrders: matchedWeek.totalOrders,
        singleRuns: matchedWeek.singleRuns,
        multiRuns: matchedWeek.multiRuns,
        targetCompleted: matchedWeek.targetCompleted,
      }
    : null;

  return {
    dateISO,
    dayNumber,
    weekdayIndex,
    weekdayName,
    weekSlot,
    demandLevel,
    demandColor,
    festivals: dayFestivals,
    hasFestival,
    hasWeatherAlert,
    weatherCondition: month.season,
    rainfallRisk,
    rainfallNormalMm: month.rainfallNormalMm,
    peakDeliveryHours,
    verifiedIncentives,
    unverifiedIncentives,
    estimatedIncomeLow,
    estimatedIncomeHigh,
    estimatedFuelAndMaintenance,
    recommendedSavings,
    safetyWarning,
    recommendation,
    actualEarned,
    actualOrderPayout,
    actualIncentives,
    actualCompletedOrders,
    actualSingleRuns,
    actualMultiRuns,
    actualExcludedOrders,
    actualDetailNote,
    actualSource,
    weekEarnedSummary,
  };
}
