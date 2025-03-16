const { StreamHandler } = require('../public/js/streamingHandler.cjs');

const validateInput = ({ sessionId, content, options }) => {
  if (!sessionId) {
    throw new Error('Missing required field: sessionId');
  }
  if (!content) {
    throw new Error('Missing required field: content');
  }
  if (!content.text) {
    throw new Error('Missing required field: content.text');
  }
  if (!options) {
    throw new Error('Missing required field: options');
  }
};

const streamAnalyzeJob = async (params) => {
  validateInput(params);
  return {
    success: true,
    sessionId: params.sessionId,
    content: params.content,
    options: params.options
  };
};

module.exports = {
  streamAnalyzeJob
};
