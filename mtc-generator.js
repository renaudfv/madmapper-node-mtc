const midi = require('midi');

class MTCGenerator {
    constructor() {
        this.output = new midi.Output();
        this.findAndConnectToMadMapper();
        
        this.running = false;
        this.frameRate = 30; // Default to 30fps
        this.hours = 0;
        this.minutes = 0;
        this.seconds = 0;
        this.frames = 0;
        this.quarterFrame = 0;

        // Setup clean exit handlers
        process.on('SIGINT', () => this.handleExit());
        process.on('SIGTERM', () => this.handleExit());
        process.on('uncaughtException', (err) => {
            console.error('Uncaught Exception:', err);
            this.handleExit();
        });
    }

    findAndConnectToMadMapper() {
        const portCount = this.output.getPortCount();
        let madMapperPort = -1;

        console.log('Available MIDI ports:');
        for (let i = 0; i < portCount; i++) {
            const portName = this.output.getPortName(i);
            console.log(`[${i}] ${portName}`);
            if (portName.includes('MadMapper In')) {
                madMapperPort = i;
            }
        }

        if (madMapperPort === -1) {
            throw new Error('MadMapper MIDI input port not found');
        }

        this.output.openPort(madMapperPort);
        console.log(`Connected to MadMapper on port ${madMapperPort}`);
    }

    // Handle clean exit
    handleExit() {
        console.log('\nShutting down MTC Generator...');
        this.stop();
        this.close();
        process.exit(0);
    }

    // Convert decimal to BCD (Binary Coded Decimal)
    toBCD(value) {
        return ((Math.floor(value / 10) << 4) | (value % 10)) & 0x7F;
    }

    // Send Full Frame message
    sendFullFrame() {
        const rateCode = this.frameRate === 24 ? 0 :
                        this.frameRate === 25 ? 1 :
                        this.frameRate === 29.97 ? 2 : 3; // 30fps

        // System Exclusive message for full frame
        const fullFrame = [
            0xF0, // Start of SysEx
            0x7F, // Universal Real Time
            0x7F, // All devices
            0x01, // MTC
            0x01, // Full Frame
            this.toBCD(this.hours) | (rateCode << 5),
            this.toBCD(this.minutes),
            this.toBCD(this.seconds),
            this.toBCD(this.frames),
            0xF7  // End of SysEx
        ];

        this.output.sendMessage(fullFrame);
    }

    // Send Quarter Frame message
    sendQuarterFrame() {
        const pieces = [
            this.frames & 0x0F,           // Frame LSB
            (this.frames & 0xF0) >> 4,    // Frame MSB
            this.seconds & 0x0F,          // Seconds LSB
            (this.seconds & 0xF0) >> 4,   // Seconds MSB
            this.minutes & 0x0F,          // Minutes LSB
            (this.minutes & 0xF0) >> 4,   // Minutes MSB
            this.hours & 0x0F,            // Hours LSB
            (this.hours & 0xF0) >> 4      // Hours MSB & Frame Rate
        ];

        // F1 message with piece data
        this.output.sendMessage([0xF1, (this.quarterFrame << 4) | pieces[this.quarterFrame]]);
        
        this.quarterFrame = (this.quarterFrame + 1) % 8;

        // Update timecode after a complete frame (8 quarter frames)
        if (this.quarterFrame === 0) {
            this.frames++;
            if (this.frames >= this.frameRate) {
                this.frames = 0;
                this.seconds++;
                if (this.seconds >= 60) {
                    this.seconds = 0;
                    this.minutes++;
                    if (this.minutes >= 60) {
                        this.minutes = 0;
                        this.hours++;
                        if (this.hours >= 24) {
                            this.hours = 0;
                        }
                    }
                }
            }
        }
    }

    // Start generating MTC
    start() {
        if (this.running) return;
        this.running = true;
        
        // Send full frame first
        this.sendFullFrame();
        
        // Calculate interval based on frame rate and quarter frames
        const interval = Math.floor(1000 / (this.frameRate * 4));
        
        this.timer = setInterval(() => {
            this.sendQuarterFrame();
        }, interval);
    }

    // Stop generating MTC
    stop() {
        if (!this.running) return;
        this.running = false;
        clearInterval(this.timer);
    }

    // Set timecode position
    setPosition(hours, minutes, seconds, frames) {
        this.hours = hours;
        this.minutes = minutes;
        this.seconds = seconds;
        this.frames = frames;
        this.quarterFrame = 0;

        if (this.running) {
            this.sendFullFrame();
        }
    }

    // Set frame rate
    setFrameRate(rate) {
        if (![24, 25, 29.97, 30].includes(rate)) {
            throw new Error('Invalid frame rate. Must be 24, 25, 29.97, or 30');
        }
        this.frameRate = rate;
    }

    // Clean up
    close() {
        this.stop();
        this.output.closePort();
    }
}

module.exports = MTCGenerator;