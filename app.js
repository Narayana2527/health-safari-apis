const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 5000;
const DATA_FILE = path.join(__dirname, "camp.json"); // Path to JSON file

app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to read JSON file
const readData = () => {
    const rawData = fs.readFileSync(DATA_FILE);
    return JSON.parse(rawData);
};

// Function to write JSON file
const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

app.get('/',(req,res)=>{
    res.send({
        message:"Welcome to hsapi"
    })
});

app.get('/get-data',(req,res)=>{
    let data = readData();
    res.status(200).json(data)
});

app.post("/book-appointment", (req, res) => {
    const { name, email, mobile, treatment, message, doctorName, date, selectedSlot } = req.body;

    if (!name || !email || !mobile || !treatment || !message || !doctorName || !date || !selectedSlot) {
        return res.status(400).json({ message: "All fields are required" });
    }

    let doctorsData = readData();
    let appointmentBooked = false;

    
    for (let department of doctorsData) {
        let doctor = department.doctors.find(doc => doc.name === doctorName);
        if (doctor) {
            // Find the selected date
            let slotDay = doctor.slots.find(slot => slot.date === date);
            if (slotDay) {
                // Find the selected time slot
                if (slotDay.slot[selectedSlot] && Object.keys(slotDay.slot[selectedSlot].patientInfo).length === 0) {
                    slotDay.slot[selectedSlot].patientInfo = { name, email, mobile, treatment, message };
                    appointmentBooked = true;
                    writeData(doctorsData);
                    return res.status(200).json({
                        message: `Appointment booked with ${doctorName} on ${date} at ${selectedSlot}`,
                    });
                }
            }
        }
    }

    if (!appointmentBooked) {
        return res.status(400).json({ message: "No available slot found or already booked" });
    }
});

app.get("/get-other-appointments", (req, res) => {
    let doctorsData = readData();
    let otherAppointments = [];   

    doctorsData.forEach(department => {
        department.doctors.forEach(doctor => {
            doctor.slots.forEach(slotDay => {                
                if (slotDay.others && slotDay.others["other-patients"]) {
                    Object.entries(slotDay.others["other-patients"]).forEach(([key, details]) => {
                        if (details.patientInfo && Object.keys(details.patientInfo).length !== 0) {
                            otherAppointments.push({
                                departmentName: department.departmentName,
                                doctorName: doctor.name,
                                date: slotDay.date,
                                patientInfo: details.patientInfo,
                            });
                        }
                    });
                }
            });
        });
    });

    return res.status(200).json({ otherAppointments });
});

app.get("/available-slots", (req, res) => {
    let doctorsData = readData();
    let { date } = req.query; // Get date from query parameters
    let availableSlots = [];

    doctorsData.forEach(department => {
        department.doctors.forEach(doctor => {
            doctor.slots.forEach(slot => {
                if (!date || slot.date === date) {
                    let allTimes = Object.keys(slot.slot); // Get all slot times
                    let availableTimes = allTimes.filter(timeSlot => {
                        let slotDetails = slot.slot[timeSlot];
                        return !slotDetails.patientInfo || Object.keys(slotDetails.patientInfo).length === 0;
                    });

                    if (availableTimes.length > 0) {
                        availableSlots.push({
                            departmentName: department.departmentName,
                            doctor: doctor.name,
                            date: slot.date,
                            availableTimes: availableTimes
                        });
                    }
                }
            });
        });
    });

    return res.status(200).json({ availableSlots });
});

app.get("/get-booked-appointments", (req, res) => {
    let doctorsData = readData();
    let bookedAppointments = [];

    // Iterate through all departments
    doctorsData.forEach(department => {
        department.doctors.forEach(doctor => {
            doctor.slots.forEach(slotDay => {
                Object.entries(slotDay.slot).forEach(([timeSlot, details]) => {
                    if (Object.keys(details.patientInfo).length !== 0) {
                        bookedAppointments.push({
                            departmentName: department.departmentName,
                            doctorName: doctor.name,
                            date: slotDay.date,
                            timeSlot: timeSlot,
                            patientInfo: details.patientInfo,
                        });
                    }
                });
            });
        });
    });

    return res.status(200).json({ bookedAppointments });
});

app.post("/check-user", async (req, res) => {
    const { email } = req.body;

    try {
        const jsonData = readData(); // Load your JSON data from a file

        let userExists = false;

        jsonData.forEach(department => {
            department.doctors.forEach(doctor => {
                doctor.slots.forEach(slot => {
                    // Check in scheduled slot patientInfo
                    Object.values(slot.slot).forEach(({ patientInfo }) => {
                        if (patientInfo?.email === email) {
                            userExists = true;
                        }
                    });

                    // Check in other-patients list
                    slot.others["other-patients"].forEach(({ patientInfo }) => {
                        if (patientInfo?.email === email) {
                            userExists = true;
                        }
                    });
                });
            });
        });

        return res.json({ exists: userExists });
    } catch (error) {
        console.error("Error checking user:", error);
        res.status(500).json({ exists: false, message: "Server error" });
    }
});

app.post("/join-waiting-list", (req, res) => {
    const { name, email, mobile, treatment, message, doctorName, date } = req.body;

    if (!name || !email || !mobile || !treatment || !message || !doctorName || !date) {
        return res.status(400).json({ message: "All fields are required" });
    }

    let doctorsData = readData();
    let appointmentAdded = false;

    for (let department of doctorsData) {
        let doctor = department.doctors.find(doc => doc.name === doctorName);
        if (doctor) {
            let slotDay = doctor.slots.find(slot => slot.date === date);
            if (slotDay) {
                if (slotDay.others["other-patients"]) {
                    slotDay.others["other-patients"].push({ patientInfo: { name, email, mobile, treatment, message } });
                    appointmentAdded = true;
                    writeData(doctorsData);
                    return res.status(200).json({
                        message: `Added to waiting list for ${doctorName} on ${date}`,
                    });
                }
            }
        }
    }

    if (!appointmentAdded) {
        return res.status(400).json({ message: "Could not join waiting list" });
    }
});

app.post("/check-slot", (req, res) => {
    const { doctorName, date, selectedSlot } = req.body;
    if (!doctorName || !date || !selectedSlot) {
        return res.status(400).json({ message: "Doctor name, date, and slot are required" });
    }
    let doctorsData = readData();
    for (let department of doctorsData) {
        let doctor = department.doctors.find(doc => doc.name === doctorName);
        if (doctor) {
            let slotDay = doctor.slots.find(slot => slot.date === date);
            if (slotDay) {
                if (slotDay.slot[selectedSlot] && Object.keys(slotDay.slot[selectedSlot].patientInfo).length === 0) {
                    return res.status(200).json({ available: true, message: "Slot is available" });
                }
                return res.status(200).json({ available: false, message: "Slot is already booked" });
            }
        }
    }
    return res.status(404).json({ message: "Doctor or date not found" });
});

app.get("/get-doctors-list", (req, res) => {
    try {
        const doctorsData = readData();
        let doctorsList = [];

        // Extract doctors from departments
        doctorsData.forEach((department) => {
            department.doctors.forEach((doctor) => {
                doctorsList.push({
                    name: doctor.name,
                    designation: doctor.designation,
                    image: doctor.image,
                    availableSlots: doctor.slots,
                });
            });
        });

        res.status(200).json(doctorsList);
    } catch (error) {
        res.status(500).json({ message: "Error fetching doctors list" });
    }
});


app.get('/doctors-slot', (req, res) => {
    try {
        const doctorsData = readData();
        let doctorsSlot = [];

        doctorsData.forEach((department) => {
            department.doctors.forEach((doctor) => {
                doctor.slots.forEach((slot) => {
                    let slotDetails = {};
                    
                    Object.entries(slot.slot).forEach(([time, slotInfo]) => {
                        slotDetails[time] = {
                            status: slotInfo.patientInfo && Object.keys(slotInfo.patientInfo).length > 0 ? "booked" : "available",
                            patientInfo: slotInfo.patientInfo || {},
                        };
                    });

                    let otherPatients = [];
                    if (slot.others && slot.others["other-patients"]) {
                        otherPatients = slot.others["other-patients"].map(patient => patient.patientInfo || {});
                    }

                    doctorsSlot.push({
                        doctorName: doctor.name,                        
                        date: slot.date,
                        slot: slotDetails,
                        otherPatients: otherPatients,
                    });
                });
            });
        });

        res.json(doctorsSlot);
    } catch (error) {
        res.status(500).json({ message: "Error fetching doctors' slots", error });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
