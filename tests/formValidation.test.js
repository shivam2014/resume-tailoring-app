import { StreamHandler, validateAnalyzeFields, processJobAnalysis } from '../public/js/streamingHandler.js';

describe('Form validation', () => {
  let handler;
  
  beforeEach(() => {
    handler = new StreamHandler();
  });
  
  test('validateAnalyzeFields detects missing form data', () => {
    expect(() => {
      validateAnalyzeFields(null);
    }).toThrow('Form data is required');
  });
  
  test('validateAnalyzeFields detects invalid form data object', () => {
    expect(() => {
      validateAnalyzeFields({});
    }).toThrow('Invalid form data object');
  });
  
  test('processJobAnalysis validates required fields', async () => {
    const mockErrorCallback = jest.fn();
    const mockUpdateCallback = jest.fn();
    
    const formData = {
      // Missing some required fields
      apiKey: 'test-api-key',
      jobDescription: 'test job description'
      // Missing jobType and targetPosition
    };
    
    await processJobAnalysis(formData, mockUpdateCallback, mockErrorCallback);
    
    expect(mockErrorCallback).toHaveBeenCalled();
    expect(mockErrorCallback.mock.calls[0][0].message).toContain('Missing required fields');
  });
  
  test('handler.validateAnalyzeFields checks for required fields', () => {
    const mockFormData = {
      has: jest.fn().mockImplementation(key => {
        return ['apiKey'].includes(key); // Only include apiKey to trigger validation error
      }),
      get: jest.fn().mockImplementation(key => {
        if (key === 'apiKey') return 'test-key';
        return null;
      })
    };
    
    const mockErrorCallback = jest.fn();
    
    const result = handler.validateAnalyzeFields(mockFormData, mockErrorCallback);
    
    expect(result).toBe(false);
    expect(mockErrorCallback).toHaveBeenCalled();
    expect(mockErrorCallback.mock.calls[0][0]).toContain('Missing required field');
  });
  
  test('handler.validateAnalyzeFields validates all required fields', () => {
    // Mock form data that includes all required fields
    const mockFormData = {
      has: jest.fn().mockImplementation(key => {
        return ['apiKey', 'jobDescription'].includes(key);
      }),
      get: jest.fn().mockImplementation(key => {
        if (key === 'apiKey') return 'test-key';
        if (key === 'jobDescription') return 'test-description';
        return null;
      })
    };
    
    const mockErrorCallback = jest.fn();
    
    const result = handler.validateAnalyzeFields(mockFormData, mockErrorCallback);
    
    // Should return true as all fields are present
    expect(result).toBe(true);
    expect(mockErrorCallback).not.toHaveBeenCalled();
  });
});
