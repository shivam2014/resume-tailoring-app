/**
 * @jest-environment jsdom
 */

import { streamAnalyzeJob } from '../public/js/streamingHandler';

// Mock fetch for testing
global.fetch = jest.fn(() => 
  Promise.resolve({
    ok: true,
    status: 200
  })
);

describe('streamAnalyzeJob Validation', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
  });

  test('should throw error if jobData is missing', async () => {
    const onError = jest.fn();
    await streamAnalyzeJob(undefined, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("Missing job data")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should throw error if sessionId is missing', async () => {
    const onError = jest.fn();
    const jobData = {
      content: { text: 'Some text' },
      options: { jobType: 'analysis', targetPosition: 'Developer' }
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("sessionId")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should throw error if content is missing', async () => {
    const onError = jest.fn();
    const jobData = {
      sessionId: 'test-session',
      options: { jobType: 'analysis', targetPosition: 'Developer' }
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("content")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should throw error if content.text is missing', async () => {
    const onError = jest.fn();
    const jobData = {
      sessionId: 'test-session',
      content: {},
      options: { jobType: 'analysis', targetPosition: 'Developer' }
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("content.text")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should throw error if options is missing', async () => {
    const onError = jest.fn();
    const jobData = {
      sessionId: 'test-session',
      content: { text: 'Some text' }
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("options")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should throw error if required option fields are missing', async () => {
    const onError = jest.fn();
    const jobData = {
      sessionId: 'test-session',
      content: { text: 'Some text' },
      options: {}
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("options.jobType")
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('should proceed with valid data', async () => {
    fetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      headers: {
        get: () => 'text/event-stream'
      },
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true })
        })
      }
    }));

    const onError = jest.fn();
    const jobData = {
      sessionId: 'test-session',
      content: { text: 'Some text' },
      options: { jobType: 'analysis', targetPosition: 'Developer' }
    };
    
    await streamAnalyzeJob(jobData, jest.fn(), jest.fn(), onError);
    
    expect(onError).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/stream-analyze', expect.any(Object));
  });
});
