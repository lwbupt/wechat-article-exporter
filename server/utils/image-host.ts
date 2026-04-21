/**
 * 图床上传抽象层
 * 统一接口：接收图片 URL，返回图床 URL
 * 当前实现：直接返回原图 URL（透传）
 * TODO: 后期对接具体图床（SM.MS / ImgBB / R2 等）
 */

export async function uploadToImageHost(imageUrl: string): Promise<string> {
  // TODO: 后期对接具体图床服务
  // 示例对接 SM.MS:
  // 1. 下载图片 buffer
  // 2. POST https://sm.ms/api/v2/upload FormData { smfile: buffer }
  // 3. 返回 response.data.url
  return imageUrl;
}
