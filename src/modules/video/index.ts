/**
 * Video Automation Modules
 *
 * This module provides comprehensive video generation, processing, and hosting capabilities
 * through integrations with leading AI and video platforms.
 *
 * Categories:
 * - AI Video Generation: Runway, HeyGen, Synthesia
 * - Audio Processing: Whisper (transcription), ElevenLabs (text-to-speech)
 * - Video Processing: Cloudinary
 * - Video Hosting: Vimeo, TikTok
 *
 * Total Functions: 62
 */

// Runway AI - AI-powered video generation (8 functions)
export {
  generateVideo,
  getGenerationStatus,
  extendVideo,
  imageToVideo,
  upscaleVideo,
  interpolateFrames,
  removeBackground,
  cancelGeneration,
} from './runway';

// HeyGen - AI avatar videos (7 functions)
export {
  createAvatarVideo,
  createCustomAvatarVideo,
  getVideoStatus,
  listAvatars,
  listVoices,
  deleteVideo as heygenDeleteVideo,
  listVideos as heygenListVideos,
} from './heygen';

// Synthesia - AI presenter videos (8 functions)
export {
  createVideo,
  createMultiSceneVideo,
  getVideoStatus as synthesiaGetVideoStatus,
  listAvatars as synthesiaListAvatars,
  listVoices as synthesiaListVoices,
  deleteVideo as synthesiaDeleteVideo,
  listVideos as synthesiaListVideos,
  getQuota,
} from './synthesia';

// Whisper - Audio transcription (7 functions)
export {
  transcribeAudio,
  transcribeAudioFromURL,
  translateAudio,
  translateAudioFromURL,
  detectLanguage,
  transcribeWithSegments,
  generateSubtitles,
} from './whisper';

// ElevenLabs - Text-to-speech (8 functions)
export {
  generateSpeech,
  generateSpeechStream,
  listVoices as elevenlabsListVoices,
  getVoiceDetails,
  cloneVoice,
  deleteVoice,
  getSubscriptionInfo,
  getModels,
} from './elevenlabs';

// Cloudinary - Video processing (8 functions)
export {
  uploadVideo,
  transformVideo,
  generateThumbnail,
  convertFormat,
  addTextOverlay,
  deleteVideo as cloudinaryDeleteVideo,
  getVideoDetails,
  listVideos as cloudinaryListVideos,
} from './cloudinary';

// Vimeo - Video hosting (8 functions)
export {
  uploadVideo as vimeoUploadVideo,
  getVideoInfo,
  updateVideo,
  deleteVideo as vimeoDeleteVideo,
  listVideos as vimeoListVideos,
  getEmbedCode,
  getThumbnail,
  getVideoStats,
} from './vimeo';

// TikTok - Social video platform (8 functions)
export {
  initializeUpload,
  uploadVideo as tiktokUploadVideo,
  getVideoInfo as tiktokGetVideoInfo,
  getUserVideos,
  getVideoComments,
  getUserInfo,
  deleteVideo as tiktokDeleteVideo,
  getVideoAnalytics,
} from './tiktok';
