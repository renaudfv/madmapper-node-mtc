const MTCGenerator = require('./mtc-generator');

try {
    const mtc = new MTCGenerator();
    // start at 0:00:00:000
    mtc.setPosition(0, 0, 0, 0);
    mtc.start();
} catch (error) {
    console.error('Error:', error.message);
}