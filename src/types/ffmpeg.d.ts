/**
 * @ffmpeg-installer/ffmpeg 类型声明
 */
declare module '@ffmpeg-installer/ffmpeg' {
  interface FfmpegPath {
    path: string
  }

  const ffmpegPath: FfmpegPath
  export default ffmpegPath
}

/**
 * @ffprobe-installer/ffprobe 类型声明
 */
declare module '@ffprobe-installer/ffprobe' {
  interface FfprobePath {
    path: string
  }

  const ffprobePath: FfprobePath
  export default ffprobePath
}