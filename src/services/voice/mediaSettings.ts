export interface AudioInputSettings {
  deviceId: string;
  autoGainControl: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  volume: number;
}
