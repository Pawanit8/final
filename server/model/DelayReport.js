import mongoose from "mongoose";

const delayReportSchema = new mongoose.Schema({
  // Add a TTL index to automatically remove documents after 1 day
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: '1d' }
  },
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['Driver', 'Dispatcher', 'Admin'],
    required: true
  },
  resolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const DelayReport = mongoose.model('DelayReport', delayReportSchema);
export default DelayReport;