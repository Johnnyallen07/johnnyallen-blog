import { MusicController } from './music.controller';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('Music import authentication', () => {
  const auth = { getProfile: jest.fn().mockResolvedValue({ id: 'admin' }) };
  const service = {
    startYoutubeDownload: jest.fn().mockReturnValue({ taskId: 'test' }),
  };
  const controller = new MusicController(service as never, auth as never);
  it('requires authentication before creating downloads or exposing previews', async () => {
    await expect(
      controller.youtubeDownload(undefined, {
        url: 'https://youtu.be/jNQXAC9IVRw',
      }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      controller.youtubeDownloadProgress(undefined, 'test'),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      controller.youtubePreview(undefined, 'test', {} as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.startYoutubeDownload).not.toHaveBeenCalled();
  });
  it('accepts a verified admin', async () => {
    await expect(
      controller.youtubeDownload('Bearer test', {
        url: 'https://youtu.be/jNQXAC9IVRw',
      }),
    ).resolves.toEqual({ taskId: 'test' });
    expect(auth.getProfile).toHaveBeenCalledWith('test');
  });
});
