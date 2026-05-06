const express = require('express');
const fs = require('fs');

function createUploadsRoutes({ uploadDir, path }) {
  const router = express.Router();

  router.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).send('File not found');
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  });

  return router;
}

module.exports = createUploadsRoutes;
