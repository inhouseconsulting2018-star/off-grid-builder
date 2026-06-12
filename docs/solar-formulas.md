# Solar Formula Assumptions

This app is a preliminary residential solar estimator, not permit-ready engineering.
Final designs still require a site survey, utility bills, load schedule, AHJ rules,
manufacturer specs, electrical one-lines, structural review, and interconnection review.

## Panel And Array Sizing

All MVP proposal sizing uses the required production factor and rounds up to
whole panels:

```text
performanceFactor = 0.78
defaultPanelWattage = 440
requiredSystemKw = annualLoadKwh / peakSunHours / 365 / performanceFactor
panelCount = ceil(requiredSystemKw * 1000 / panelWattage)
finalSystemKw = panelCount * panelWattage / 1000
annualProductionKwh = finalSystemKw * peakSunHours * 365 * performanceFactor
```

Battery, inverter, cost, and site-warning calculations remain separate from this
canonical solar array formula.

## Losses

PV production losses are separated from battery throughput losses:

```text
pvProductionLossPct = inverterLossPct + wireLossPct + shadeLossPct
                    + tempLossPct + dirtLossPct + mismatchLossPct

batteryLossPct = chemistryRoundTripLossPct * batteryThroughputFraction

annualEnergyLossMultiplier = (1 - pvProductionLossPct / 100)
                           * (1 - batteryLossPct / 100)
```

Battery throughput fraction:

```text
off-grid = 1.00
hybrid   = 0.25
grid-tied without battery = 0
```

Chemistry round-trip loss assumptions:

```text
LiFePO4    = 8%
AGM        = 18%
Lead-acid  = 20%
```

The configured battery round-trip loss is treated as a floor, so chemistry
defaults can raise the loss for AGM/lead-acid while still allowing conservative
global settings.

## Peak Sun Hours

NREL PVWatts v8 data is preferred when `NREL_API_KEY` or `PVWATTS_API_KEY` is
configured. PVWatts supplies local irradiance/peak-sun-hours and a monthly
production profile. The canonical formula above remains the source of truth for
final annual production.

```text
system_capacity = 1 kW reference
losses = 22%
array_type = roof/open-rack/tracking based on installation type
tilt = roofPitch or named tilt default
azimuth = roofDirection
lat/lon = array coordinates, geocoded project address, or state centroid fallback
timeframe = monthly
```

PVWatts returns monthly AC production, monthly solar radiation, annual solar
radiation, and capacity factor. The engine uses annual solar radiation as peak
sun hours, then normalizes the monthly profile to the formula-derived annual
production.

If the API key is missing, geocoding fails, or PVWatts returns an error, the
engine keeps the state PSH production estimate and creates a conservative
12-month seasonal production split so reports still have monthly estimates.

State peak sun hours are annual average fallbacks for preliminary estimates.
California's required fallback is 5.5 peak sun hours. The UI and report label
the source as API or regional fallback.

## Inverter Sizing

Grid-tied:

```text
targetInverterAcKw = max(arrayDcKw / 1.2, 2.5)
```

This reflects a common residential DC:AC ratio near 1.2.

Off-grid and hybrid:

```text
averageLoadKw = dailyLoadKwh / 24
targetInverterAcKw = max(
  averageLoadKw * peakLoadFactor * 1.25,
  minimumInverterKw
)
```

Peak load factor:

```text
off-grid = 4.5
hybrid   = 3.5
```

Minimum inverter:

```text
off-grid = 5.0 kW
hybrid   = 3.8 kW
```

The previous approach sized off-grid inverter power from array DC size, which is
not how residential backup/off-grid inverters are selected.

## Battery Sizing

Full project battery sizing:

```text
backupHours = selected preset or customBackupHours
autonomyDays = backupHours / 24
acAutonomyKwh = annualLoadKwh / 365 * autonomyDays
dcAutonomyKwh = acAutonomyKwh / inverterEfficiency
usableBatteryKwh = dcAutonomyKwh * 1.10
totalBatteryBankKwh = usableBatteryKwh / (depthOfDischargePct / 100)
```

Depth of discharge:

```text
LiFePO4    = 80%
AGM        = 50%
Lead-acid  = 50%
```

Cold-climate lead-acid/AGM systems get a 25% total bank derate:

```text
totalBatteryBankKwh *= 1.25
```

Motor surge is handled in inverter sizing, not battery kWh, because surge is a
power requirement rather than an energy/autonomy requirement.

Quick proposal battery sizing has no backup-hour input, so it uses an
essential-load assumption:

```text
averageDailyKwh = annualKwh / 365
usableBatteryKwh = max(10, averageDailyKwh * 0.50)
totalBatteryKwh = usableBatteryKwh / (depthOfDischargePct / 100)
```

## Production And Payback

Annual production:

```text
yearlyProductionKwh = finalSystemKw
                    * peakSunHours
                    * 365
                    * 0.78
```

Fallback monthly production:

```text
monthlyProductionKwh = yearlyProductionKwh * seasonalMonthWeight
seasonal weights = [5.5%, 6.5%, 8.5%, 9.5%, 10.5%, 11%,
                    11%, 10.5%, 9%, 7.5%, 5.5%, 5%]
```

Savings are capped to bill-offset energy:

```text
billOffsetKwh = min(yearlyProductionKwh, annualLoadKwh)
estimatedYearlySavings = billOffsetKwh * utilityRate
paybackYears = averageInstalledCost / estimatedYearlySavings
```

Off-grid payback remains `null` because avoided utility purchases are not a good
measure for standalone systems that may have no utility alternative.
