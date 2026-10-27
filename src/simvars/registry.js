// Complete SimVar registry for 737 MAX 8  extracted from the AS05B codebase
// Categories organize the ~400+ variables into logical MCP tool groups

const DATA_TYPE_FLOAT64 = 4;
const DATA_TYPE_INT32 = 1;

// Helper to define a simvar entry
const F64 = (name, unit) => ({ name, unit, dataType: DATA_TYPE_FLOAT64, size: 8 });
const I32 = (name, unit) => ({ name, unit, dataType: DATA_TYPE_INT32, size: 4 });

const CATEGORIES = {
  position: {
    description: "Aircraft position, speed, and attitude",
    vars: [
      F64("PLANE LATITUDE", "degrees"),
      F64("PLANE LONGITUDE", "degrees"),  // used via Simplane wrappers
      F64("PLANE ALTITUDE", "feet"),
      F64("PLANE ALT ABOVE GROUND", "feet"),
      F64("PLANE HEADING DEGREES MAGNETIC", "degrees"),
      F64("PLANE HEADING DEGREES GYRO", "degrees"),
      F64("GROUND VELOCITY", "knots"),
      F64("VERTICAL SPEED", "feet per minute"),
      F64("VELOCITY BODY X", "feet per second"),
      F64("VELOCITY BODY Z", "feet per second"),
      F64("VELOCITY WORLD Y", "feet per second"),
      F64("GPS GROUND SPEED", "knots"),
      F64("GPS GROUND TRUE TRACK", "degrees"),
      F64("GPS POSITION LAT", "degrees"),
      F64("GPS POSITION LON", "degrees"),
      F64("GPS POSITION ALT", "feet"),
    ],
  },

  flight_instruments: {
    description: "Primary flight instrument readings",
    vars: [
      F64("INDICATED ALTITUDE:3", "feet"),
      F64("KOHLSMAN SETTING HG:3", "inHg"),
      F64("KOHLSMAN SETTING STD:1", "bool"),
      F64("AIRSPEED INDICATED", "knots"),  // via Simplane
      F64("AIRSPEED TRUE", "knots"),       // via Simplane
      F64("AIRSPEED MACH", "mach"),        // via Simplane
      F64("PLANE PITCH DEGREES", "degrees"),  // via Simplane
      F64("PLANE BANK DEGREES", "degrees"),   // via Simplane
      F64("DELTA HEADING RATE", "degrees per second"),
      F64("AILERON POSITION", "position"),
      F64("ELEVATOR POSITION", "position"),
      F64("RUDDER POSITION", "position"),
      F64("SPOILERS LEFT POSITION", "percent"),
      F64("SPOILERS RIGHT POSITION", "percent"),
      F64("FLAPS HANDLE INDEX", "number"),
      F64("LEADING EDGE FLAPS LEFT ANGLE", "degrees"),
      F64("MAGVAR", "degrees"),
      F64("TOTAL WEIGHT", "pounds"),
      F64("CG PERCENT", "percent"),
    ],
  },

  autopilot: {
    description: "Autopilot mode flags and target values",
    vars: [
      F64("AUTOPILOT MASTER", "bool"),  // via Simplane
      F64("AUTOPILOT AIRSPEED HOLD", "bool"),
      F64("AUTOPILOT ALTITUDE LOCK", "bool"),
      F64("AUTOPILOT APPROACH HOLD", "bool"),
      F64("AUTOPILOT BACKCOURSE HOLD", "bool"),
      F64("AUTOPILOT DISENGAGED", "bool"),
      F64("AUTOPILOT MACH HOLD", "bool"),
      F64("AUTOPILOT THROTTLE ARM", "bool"),
      F64("AUTOPILOT VERTICAL HOLD", "bool"),
      F64("AUTOPILOT VERTICAL HOLD VAR", "feet per minute"),
      F64("AUTOPILOT ALTITUDE LOCK VAR", "feet"),
      F64("GPS DRIVES NAV1", "bool"),
      F64("GPS OBS ACTIVE", "bool"),
      F64("GPS OBS VALUE", "degrees"),
      F64("GPS WP DESIRED TRACK", "degrees"),
      F64("GPS WP DISTANCE", "nautical miles"),
      F64("GPS VERTICAL ERROR", "feet"),
      F64("GPS IS ACTIVE FLIGHT PLAN", "bool"),
      F64("GPS FLIGHT PLAN WP COUNT", "number"),
    ],
  },

  engines: {
    description: "Engine performance data (dual engine)",
    vars: [
      F64("ENG N2 RPM:1", "percent"),
      F64("ENG N2 RPM:2", "percent"),
      F64("TURB ENG N1:1", "percent"),  // indexed via loop in source
      F64("TURB ENG N1:2", "percent"),
      F64("TURB ENG N2:1", "percent"),
      F64("TURB ENG N2:2", "percent"),
      F64("TURB ENG CORRECTED N1:1", "percent"),
      F64("TURB ENG CORRECTED N1:2", "percent"),
      F64("ENG EXHAUST GAS TEMPERATURE:1", "celsius"),
      F64("ENG EXHAUST GAS TEMPERATURE:2", "celsius"),
      F64("ENG OIL PRESSURE:1", "psi"),
      F64("ENG OIL PRESSURE:2", "psi"),
      F64("ENG OIL TEMPERATURE:1", "celsius"),
      F64("ENG OIL TEMPERATURE:2", "celsius"),
      F64("ENG OIL QUANTITY:1", "percent"),
      F64("ENG OIL QUANTITY:2", "percent"),
      F64("ENG FUEL FLOW GPH:1", "gallons per hour"),
      F64("ENG FUEL FLOW GPH:2", "gallons per hour"),
      F64("TURB ENG FUEL FLOW PPH:1", "pounds per hour"),
      F64("TURB ENG FUEL FLOW PPH:2", "pounds per hour"),
      F64("ENG ANTI ICE:1", "bool"),
      F64("ENG ANTI ICE:2", "bool"),
      F64("ENG RPM ANIMATION PERCENT:1", "percent"),
      F64("ENG RPM ANIMATION PERCENT:2", "percent"),
      F64("ENG VIBRATION:1", "number"),
      F64("ENG VIBRATION:2", "number"),
    ],
  },

  fuel: {
    description: "Fuel quantities and weight",
    vars: [
      F64("FUEL TOTAL QUANTITY", "gallons"),
      F64("FUEL WEIGHT PER GALLON", "pounds"),
      F64("GENERAL ENG FUEL USED SINCE START:1", "pounds"),
    ],
  },

  environment: {
    description: "Weather and environment data",
    vars: [
      F64("AMBIENT TEMPERATURE", "celsius"),
      F64("AMBIENT PRESSURE", "inHg"),
      F64("AMBIENT WIND VELOCITY", "knots"),
      F64("AMBIENT WIND DIRECTION", "degrees"),
      F64("AIRCRAFT WIND Z", "knots"),
      F64("E:ABSOLUTE TIME", "seconds"),
    ],
  },

  radio_nav: {
    description: "Radio, NAV, COM, ADF, VOR, transponder",
    vars: [
      F64("NAV FREQUENCY:1", "MHz"),
      F64("NAV FREQUENCY:2", "MHz"),
      F64("NAV STANDBY FREQUENCY:1", "MHz"),
      F64("NAV STANDBY FREQUENCY:2", "MHz"),
      F64("NAV IDENT:1", "string"),
      F64("NAV IDENT:2", "string"),
      F64("NAV OBS:1", "degrees"),
      F64("NAV OBS:2", "degrees"),
      F64("NAV CDI:1", "number"),
      F64("NAV CDI:2", "number"),
      F64("NAV GSI:1", "number"),
      F64("NAV GSI:2", "number"),
      F64("NAV DME:1", "nautical miles"),
      F64("NAV DME:2", "nautical miles"),
      F64("NAV RADIAL:1", "degrees"),
      F64("NAV RADIAL:2", "degrees"),
      F64("NAV HAS GLIDE SLOPE:1", "bool"),
      F64("NAV HAS GLIDE SLOPE:2", "bool"),
      F64("NAV HAS NAV:1", "bool"),
      F64("NAV HAS NAV:2", "bool"),
      F64("NAV LOCALIZER:1", "degrees"),
      F64("NAV TOFROM:1", "enum"),
      F64("NAV CODES:1", "flags"),
      F64("NAV CODES:2", "flags"),
      F64("NAV MAGVAR:1", "degrees"),
      F64("COM ACTIVE FREQUENCY:1", "MHz"),
      F64("COM ACTIVE FREQUENCY:2", "MHz"),
      F64("COM STANDBY FREQUENCY:1", "MHz"),
      F64("COM STANDBY FREQUENCY:2", "MHz"),
      F64("ADF ACTIVE FREQUENCY:1", "Hz"),
      F64("ADF STANDBY FREQUENCY:1", "Hz"),
      F64("ADF RADIAL MAG:1", "degrees"),
      F64("ADF SIGNAL:1", "number"),
      F64("TRANSPONDER CODE:1", "number"),
      F64("TRANSPONDER STATE:1", "enum"),
    ],
  },

  fmc_state: {
    description: "FMC operational state, V-speeds, route flags, perf data",
    vars: [
      F64("L:FMC_ACTIVE_STATE", "number"),
      F64("L:FMC_FLIGHT_PLAN_IS_TEMPORARY", "number"),
      F64("L:FMC_FLIGHT_PLAN_IS_INACTIVE", "number"),
      F64("L:FMC_PERF_DATA_AVAILABLE", "boolean"),
      F64("L:FMC_PERF_DATA_MOD_AVAILABLE", "boolean"),
      F64("L:FMC_TOTALIZER_SELECTED", "boolean"),
      F64("L:AIRLINER_V1_SPEED", "Knots"),
      F64("L:AIRLINER_VR_SPEED", "Knots"),
      F64("L:AIRLINER_V2_SPEED", "Knots"),
      F64("L:AIRLINER_CRUISE_ALTITUDE", "feet"),
      F64("L:AIRLINER_ACC_ALT", "number"),
      F64("L:AIRLINER_THR_RED_ALT", "number"),
      F64("L:AIRLINER_THRUST_MODE", "number"),
      F64("L:AIRLINER_THRUST_TAKEOFF_MODE", "number"),
      F64("L:AIRLINER_THRUST_CLIMB_MODE", "number"),
      F64("L:AIRLINER_THRUST_IN_AIR_MODE", "number"),
      F64("L:AIRLINER_FMC_FORCE_NEXT_UPDATE", "number"),
      F64("L:FLAP_SETTING_FMC", "number"),
      F64("L:FMC_TAKEOFF_FLAP_FMC_DISAGREE_MESSAGE", "boolean"),
      F64("L:FMC_DistToDestination", "nautical miles"),
      F64("L:FMC_VTK", "feet"),
      F64("L:FMC_ISA_TEMP_DEV", "number"),
      F64("L:FMC_ApproachLateralDeviation", "number"),
      F64("L:DIRECT_TO_EXCECUTED", "boolean"),
      F64("L:Glasscockpits_FPLHaveOrigin", "boolean"),
      F64("L:Glasscockpits_FPLHaveDestination", "boolean"),
      F64("L:FLIGHTPLAN_USE_DECEL_WAYPOINT", "boolean"),
      F64("L:VA737M_WEIGHT", "number"),
      F64("L:VA737M_INFO_WEIGHT", "number"),
      F64("L:METRIC_SYSTEM_USED", "boolean"),
      F64("L:IRS_POS_AVAILABLE", "boolean"),
      F64("L:FMC_VA737M_TRANSITION_ALTITUDE", "number"),
      F64("L:VA737_BFMS_ENABLED", "number"),
      F64("L:INTERCEPT_COURSE_SELECTED", "boolean"),
      F64("L:INTERCEPT_COURSE_VALUE", "degrees"),
      F64("L:INTERCEPT_INDEX", "number"),
    ],
  },

  vnav: {
    description: "VNAV speeds, constraints, descent/climb state",
    vars: [
      F64("L:AP_VNAV_ACTIVE", "boolean"),
      F64("L:AP_VNAV_CONSTRAINT_ALTITUDE", "feet"),
      F64("L:FMC_VNAV_CLB_TGT_SPD_KNOTS", "knots"),
      F64("L:FMC_VNAV_CLB_TGT_SPD_MACH", "mach"),
      F64("L:FMC_VNAV_DES_TGT_SPD_KNOTS", "knots"),
      F64("L:FMC_VNAV_DES_TGT_SPD_MACH", "mach"),
      F64("L:FMC_VNAV_CRUISE_SPEED_KTS", "knots"),
      F64("L:FMC_VNAV_CRZ_ECON_TGT_SPD_MACH", "mach"),
      F64("L:FMC_VNAV_CRZ_LRC_TGT_SPD_MACH", "mach"),
      F64("L:FMC_VNAV_CRZ_MACH_TGT_SPD_KNOTS", "knots"),
      F64("L:FMC_VNAV_CRZ_MACH_TGT_SPD_MACH", "mach"),
      F64("L:FMC_VNAV_CLB_RES_ALT", "feet"),
      F64("L:FMC_VNAV_CLB_RES_SPD", "knots"),
      F64("L:FMC_VNAV_DES_RES_ALT", "feet"),
      F64("L:FMC_VNAV_DES_RES_SPD", "knots"),
      F64("L:FMC_DESCENT_VNAV_SPD_MODE_ACTIVE", "boolean"),
      F64("L:DESCENT_PHASE_ENGAGED", "boolean"),
      F64("L:EARLY_DESCENT_PHASE_ENGAGED", "boolean"),
      F64("L:EARLY_DESCENT_OVER", "boolean"),
      F64("L:CRUISE_DESCENT_SET", "boolean"),
      F64("L:CRUISE_CLIMB_SET", "boolean"),
      F64("L:CRUISE_SPEED_CONSTRAINT", "number"),
      F64("L:CRUISE_DECEL_SEQUENCED", "boolean"),
      F64("L:VNAV_ALT_ACQUIRED", "boolean"),
      F64("L:VNAV_DECEL_ACTIVE", "boolean"),
      F64("L:VNAV_INITIATE_DIVE", "boolean"),
      F64("L:VNAV_SPEED_BAND_BUFFER", "number"),
      F64("L:DESCENT_FLAP_UP", "number"),
      F64("L:LEVEL_CHANGE_TRIGGER", "number"),
      F64("L:FLAP_INCREMENTAL_SPEED", "knots"),
      F64("L:FLAP_RETRACTION_SPEED", "knots"),
      F64("L:SPD_HOLD_ENGAGED_IN_DESCENT", "boolean"),
    ],
  },

  ap_modes: {
    description: "AP mode flags, FCC settings, HDG/ALT/VS/SPD selectors",
    vars: [
      F64("L:AP_LNAV_ACTIVE", "boolean"),
      F64("L:AP_SPD_ACTIVE", "boolean"),
      F64("L:AP_SPEED_INTERVENTION_ACTIVE", "boolean"),
      F64("L:ALT_HOLD_ACTIVE", "boolean"),
      F64("L:ALT_INTV_TRIGGER", "number"),
      F64("L:AP_ALT_HOLD_ACTIVE", "boolean"),
      F64("L:AP_HEADING_HOLD_ACTIVE", "boolean"),
      F64("L:AP_LEVELOFF_OPTIMIZATION_ENABLED", "boolean"),
      F64("L:HDG_SEL_ACTIVE", "boolean"),
      F64("L:VS_ACTIVE", "boolean"),
      F64("L:VS_ARMED", "boolean"),
      F64("L:APP_ACTIVE", "boolean"),
      F64("L:VOR_LOC_ACTIVE", "boolean"),
      F64("L:VOR_LOC_STATE", "number"),
      F64("L:VA737_ALT_HOLD_ACTIVE", "boolean"),
      F64("L:VA737M_AUTOPILOT_PRE_ENGAGED", "boolean"),
      F64("L:VA737M_CMD_A_Press", "boolean"),
      F64("L:VA737M_CMD_B_Press", "boolean"),
      F64("L:VA737M_CMD_A_Init", "boolean"),
      F64("L:VA737M_CMD_B_Init", "boolean"),
      F64("L:VA737M_ALT_HOLD_AP_TRIGGER", "number"),
      F64("L:VA737M_HDG_SEL_AP_TRIGGER", "number"),
      F64("L:VA737M_LVL_CHG_AP_TRIGGER", "number"),
      F64("L:XMLVAR_FCC_ALTITUDE_SEL", "feet"),
      F64("L:XMLVAR_FCC_HEADING_SEL", "degrees"),
      F64("L:XMLVAR_FCC_SPEED_SEL", "knots"),
      F64("L:XMLVAR_FCC_VERTICAL_SPEED_SEL", "feet per minute"),
      F64("L:XMLVAR_FCC_1_COURSE_SEL", "degrees"),
      F64("L:XMLVAR_FCC_2_COURSE_SEL", "degrees"),
      F64("L:XMLVAR_FCC_FD_1_Value", "boolean"),
      F64("L:XMLVAR_FCC_FD_2_Value", "boolean"),
      F64("L:XMLVAR_FCC_BANK_ANGLE_SEL_Value", "number"),
      F64("L:XMLVAR_INDICATOR_Caution_EXEC_1", "number"),
      F64("L:XMLVAR_INDICATOR_Caution_EXEC_2", "number"),
      F64("L:FMA_PITCH_MODE", "number"),
      F64("L:N1_Active", "boolean"),
      F64("L:XMLVAR_N1_mode", "number"),
      F64("L:XMLVAR_SpdRef_mode", "number"),
    ],
  },

  n1_thrust: {
    description: "N1 thrust limits and selected temps",
    vars: [
      F64("L:VA737M_N1_BothEngines", "percent"),
      F64("L:VA737M_N1_Engine1", "percent"),
      F64("L:VA737M_N1_SELECTED", "percent"),
      F64("L:VA737M_N1_SELECTED_TEMP", "number"),
      F64("L:VA737M_N1_SELECTED_TEMP_ENTERED", "boolean"),
      F64("L:VA737M_N1_SELECTED_TEMP_UNIT", "number"),
      F64("L:VA737M_N1_TAKEOFF_LIMIT", "percent"),
    ],
  },

  systems: {
    description: "Hydraulics, pressurization, electrical, gear, anti-ice",
    vars: [
      F64("L:XMLVAR_HYDRAULIC_PRESSURE_A", "psi"),
      F64("L:XMLVAR_HYDRAULIC_PRESSURE_B", "psi"),
      F64("L:XMLVAR_HYDRAULIC_QUANTITY_A", "percent"),
      F64("L:XMLVAR_HYDRAULIC_QUANTITY_B", "percent"),
      F64("CIRCUIT AVIONICS ON", "bool"),
      F64("CIRCUIT HYDRAULIC PUMP ON:1", "bool"),
      F64("CIRCUIT HYDRAULIC PUMP ON:2", "bool"),
      F64("L:XMLVAR_PRESSURIZATION_ALTITUDE_FLIGHT", "feet"),
      F64("L:XMLVAR_PRESSURIZATION_ALTITUDE_LANDING", "feet"),
      F64("L:XMLVAR_PRESSURIZATION_AIRFLOW_VALVE_POSITION", "percent"),
      F64("L:XMLVAR_INDICATOR_Info_LEFT_GEAR_BOTTOM", "boolean"),
      F64("L:XMLVAR_INDICATOR_Info_NOSE_GEAR_BOTTOM", "boolean"),
      F64("L:XMLVAR_INDICATOR_Info_RIGHT_GEAR_BOTTOM", "boolean"),
      F64("L:XMLVAR_INDICATOR_Warning_LEFT_GEAR_TOP", "boolean"),
      F64("L:XMLVAR_INDICATOR_Warning_NOSE_GEAR_TOP", "boolean"),
      F64("L:XMLVAR_INDICATOR_Warning_RIGHT_GEAR_TOP", "boolean"),
      F64("L:XMLVAR_ENGINE_APU_Position", "number"),
      F64("L:XMLVAR_INDICATOR_Info_APU_GEN_OFF_BUS", "boolean"),
    ],
  },

  efis: {
    description: "EFIS modes, ranges, mins, map settings",
    vars: [
      F64("L:EFIS_MODE_MAP", "number"),
      F64("L:EFIS_RANGE_NM_VALUE_1", "number"),
      F64("L:EFIS_RANGE_NM_VALUE_2", "number"),
      F64("L:EFIS_ALT_1", "number"),
      F64("L:EFIS_ALT_2", "number"),
      F64("L:EFIS_ALT_DIFFERENCE", "number"),
      F64("L:XMLVAR_MINS_BARO_ALTITUDE_SEL_1", "feet"),
      F64("L:XMLVAR_MINS_RADIO_ALTITUDE_SEL_1", "feet"),
      F64("L:XMLVAR_MFD_CURRENT_PAGE", "number"),
      F64("L:XMLVAR_MFD_ENG_CURRENT_PAGE", "number"),
      F64("L:XMLVAR_EICAS_INDEX", "number"),
      F64("L:AS05B_MAP_MODE_FMC_1", "number"),
      F64("L:AS05B_MAP_MODE_FMC_2", "number"),
    ],
  },

  hud: {
    description: "HUD speed bugs and AP selected values",
    vars: [
      F64("L:HUD_AP_SELECTED_ALTITUDE", "feet"),
      F64("L:HUD_AIRSPEED_GREEN_START", "knots"),
      F64("L:HUD_AIRSPEED_GREEN_END", "knots"),
      F64("L:HUD_AIRSPEED_YELLOW_START", "knots"),
      F64("L:HUD_AIRSPEED_YELLOW_END", "knots"),
      F64("L:HUD_AIRSPEED_RED_START", "knots"),
      F64("L:HUD_AIRSPEED_RED_END", "knots"),
      F64("L:HUD_AIRSPEED_WHITE_START", "knots"),
      F64("L:HUD_AIRSPEED_WHITE_END", "knots"),
      F64("L:VA737M_SpareSpeedBug", "knots"),
      F64("L:INFO_SPD_REF_MODE", "number"),
      F64("L:INFO_V1_SPEED", "knots"),
      F64("L:INFO_VR_SPEED", "knots"),
      F64("L:INFO_VREF_SPEED", "knots"),
    ],
  },

  annunciations: {
    description: "Master caution/warning, FMC messages, ATC",
    vars: [
      F64("MASTER CAUTION ACTIVE", "bool"),
      F64("MASTER CAUTION ACKNOWLEDGED", "bool"),
      F64("MASTER WARNING ACTIVE", "bool"),
      F64("MASTER WARNING ACKNOWLEDGED", "bool"),
      F64("L:ATC_MESSAGE", "number"),
      F64("L:ATC_NOTIFICATION", "number"),
      F64("L:ATC_SID_CHANGE", "number"),
      F64("L:Annunciations_Manager_Initialized", "boolean"),
      F64("L:AOA_MAX", "degrees"),
      F64("L:AC_BANK_ANGLE", "degrees"),
      F64("L:XMLVAR_INDICATOR_Info_FCC_AP_LVL_CHG", "boolean"),
    ],
  },

  rnp_anp: {
    description: "RNP/ANP navigation accuracy",
    vars: [
      F64("L:VP737_Lateral_RNP", "nautical miles"),
      F64("L:VP737_Lateral_ANP", "nautical miles"),
      F64("L:FMC_Vertical_RNP", "feet"),
      F64("L:FMC_Vertical_ANP", "feet"),
      F64("L:VP737_FMC_Cross_Track_Error", "nautical miles"),
      F64("L:VP737_FMC_X_Trk_Err_Dir", "number"),
    ],
  },
};

// Flatten all vars into a single list for data definition registration
function getAllSimVars() {
  const all = [];
  for (const [cat, { vars }] of Object.entries(CATEGORIES)) {
    for (const v of vars) {
      all.push({ ...v, category: cat });
    }
  }
  return all;
}

function getVarsByCategory(category) {
  return CATEGORIES[category]?.vars || [];
}

function getCategoryNames() {
  return Object.keys(CATEGORIES);
}

function getCategoryDescription(category) {
  return CATEGORIES[category]?.description || "";
}

module.exports = { CATEGORIES, getAllSimVars, getVarsByCategory, getCategoryNames, getCategoryDescription, DATA_TYPE_FLOAT64, DATA_TYPE_INT32 };
