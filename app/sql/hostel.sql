-- =============================================================================
-- Database Name: checkinout_hostel_db
-- =============================================================================

-- Drop and recreate the database (use only when you want to start fresh)
DROP DATABASE IF EXISTS checkinout_hostel_db;

CREATE DATABASE IF NOT EXISTS checkinout_hostel_db;
USE checkinout_hostel_db;

/* TABLE DESIGN JUSTIFICATION
===============================================================================
| #  | Table Name          | Type             | Why We Need It (Justification)                                    |
|----|---------------------|------------------|-------------------------------------------------------------------|
| 1  | Member              | Core Entity      | Stores students/residents data.                                   |
| 2  | Hostel              | Core Entity      | Supports multiple hostels/blocks (scalable design).               |
| 3  | Room                | Core Entity      | Central to the whole system; links members, furniture, allocation |
| 4  | RoomType            | Lookup           | Single, Double, Triple, AC/Non-AC, etc. (normalization support)   |
| 5  | Allocation          | Core (Bridge)    | Check-in / Check-out records; heart of the project                |
| 6  | FurnitureType       | Lookup           | Bed, Chair, Cupboard, Table, Mattress, etc.                       |
| 7  | FurnitureItem       | Core Entity      | Tracks actual furniture pieces with condition & serial number     |
| 8  | Complaint           | Core Entity      | Student complaints with status tracking                           |
| 9  | ComplaintCategory   | Lookup           | Electrical, Plumbing, Cleanliness, WiFi, Furniture Damage, etc.   |
| 10 | Visitor             | Core Entity      | Visitor registration with in/out timing                           |
| 11 | QRScanLog           | Log Table        | Records every QR scan (security & tracking feature)               |
| 12 | MaintenanceRequest  | Core Entity      | Separate maintenance workflow (distinct from complaints)          |
===============================================================================
*/

-- =============================================================================
-- TABLE: Member (registration & management)
-- =============================================================================
CREATE TABLE if not exists Member (
    MemberID        INT             AUTO_INCREMENT          UNIQUE,

    -- Mandatory fields from assignment
    Name            VARCHAR(100)    NOT NULL,
    Image           VARCHAR(255),                           -- can be NULL
    Age             INT             NOT NULL,
    Email           VARCHAR(150)    NOT NULL    UNIQUE,
    ContactNumber   VARCHAR(20)     NOT NULL,
    IdentificationNumber  VARCHAR(50)     NOT NULL    PRIMARY KEY,   -- roll no, employee ID, Aadhaar, passport, etc.
	AllocatedDate   DATE            NOT NULL,               -- date when person was allocated/registered/admitted
    PurposeOfStay   ENUM(
        'Resident Student',
        'Staff',
        'Visitor',
        'Guest',
        'Short-term',
        'Researcher',
        'Exchange Student',
        'Intern',
        'Maintenance/Contractor',
        'Other'
    )               NOT NULL,
    
    -- Additional fields (some optional)
    Department      VARCHAR(100),
    YearOfStudy     TINYINT,
    Gender          ENUM('Male', 'Female', 'Other', 'Prefer not to say') NOT NULL,
    DateOfBirth     DATE            NOT NULL,
    PermanentAddress TEXT,
    GuardianName    VARCHAR(100),
    GuardianContact VARCHAR(20),
    
    -- QR feature
    QRCode          VARCHAR(100)    NOT NULL    UNIQUE,

    -- Status & audit
    IsActive        BOOLEAN         NOT NULL    DEFAULT TRUE,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_member_age_positive          CHECK (Age > 0),
    CONSTRAINT chk_year_of_study_range          CHECK (YearOfStudy IS NULL OR YearOfStudy BETWEEN 1 AND 10)
);

-- =============================================================================
-- TABLE: Hostel
-- =============================================================================
CREATE TABLE Hostel (
    HostelID        INT             AUTO_INCREMENT          PRIMARY KEY,
    Name            VARCHAR(100)    NOT NULL,               -- e.g. 'Aryabhatta Hostel', 'Narmada Hostel', 'Ramanujan Hostel'
    ShortCode       VARCHAR(10)     NOT NULL    UNIQUE,     -- e.g. 'ABH', 'NRM', 'RJM'
    WardenName      VARCHAR(100)    NOT NULL,
    WardenContact   VARCHAR(20),
    Address         VARCHAR(255)    NOT NULL,
    
    NumSingleRooms  INT             NOT NULL    DEFAULT 0,  -- 1-person rooms
    NumDoubleRooms  INT             NOT NULL    DEFAULT 0,  -- 2-person rooms
    NumTripleRooms  INT             NOT NULL    DEFAULT 0,  -- 3-person rooms
    NumQuadRooms    INT             NOT NULL    DEFAULT 0,  -- 4-person rooms
    
    HostelStatus    ENUM('Available', 'Occupied', 'Under Maintenance', 'Reserved', 'Out of Service') NOT NULL DEFAULT 'Available',
    
    TotalRooms      INT             NOT NULL    DEFAULT 0,
    TotalCapacity   INT             NOT NULL    DEFAULT 0,
    
    IsActive        BOOLEAN         NOT NULL    DEFAULT TRUE,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_hostel_room_counts_non_negative CHECK (NumSingleRooms >= 0 AND NumDoubleRooms >= 0 AND NumTripleRooms >= 0 AND NumQuadRooms >= 0),
    CONSTRAINT chk_hostel_totals_positive CHECK (TotalRooms >= 0 AND TotalCapacity >= 0),
    CONSTRAINT chk_total_rooms_consistent CHECK (TotalRooms = NumSingleRooms + NumDoubleRooms + NumTripleRooms + NumQuadRooms),
    CONSTRAINT chk_total_capacity_consistent CHECK (TotalCapacity = (NumSingleRooms * 1) + (NumDoubleRooms * 2) + (NumTripleRooms * 3) + (NumQuadRooms * 4))
);

-- =============================================================================
-- TABLE: RoomType
-- =============================================================================
CREATE TABLE RoomType (
    RoomTypeID      INT             AUTO_INCREMENT          PRIMARY KEY,
    TypeName        ENUM('Single', 'Double', 'Triple', 'Quad', 'Others') NOT NULL,
    BaseCapacity    TINYINT         NOT NULL,
    IsAC            BOOLEAN         NOT NULL    DEFAULT FALSE,
    Description     VARCHAR(200)                DEFAULT NULL,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_roomtype_name_capacity UNIQUE (TypeName, BaseCapacity)
);

-- =============================================================================
-- TABLE: Room
-- =============================================================================
CREATE TABLE Room (
    RoomID          INT             AUTO_INCREMENT          PRIMARY KEY,
    HostelID        INT             NOT NULL,
    RoomTypeID      INT             NOT NULL,
    RoomNumber      VARCHAR(20)     NOT NULL,
    Floor           TINYINT         NOT NULL,

    MaxCapacity     TINYINT         NOT NULL,
    CurrentOccupancy TINYINT        NOT NULL    DEFAULT 0,

    QRCode          VARCHAR(100)    NOT NULL    UNIQUE,

    RoomStatus      ENUM('Available', 'Occupied', 'Under Maintenance', 'Reserved', 'Out of Service') NOT NULL DEFAULT 'Available',

    IsActive        BOOLEAN         NOT NULL    DEFAULT TRUE,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (HostelID)   REFERENCES Hostel(HostelID)     ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (RoomTypeID) REFERENCES RoomType(RoomTypeID) ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_room_max_capacity CHECK (MaxCapacity BETWEEN 1 AND 4),
    CONSTRAINT chk_room_occupancy_valid CHECK (CurrentOccupancy >= 0 AND CurrentOccupancy <= MaxCapacity),
    CONSTRAINT chk_room_number_unique_per_hostel UNIQUE (HostelID, RoomNumber)
);

-- =============================================================================
-- TABLE: Allocation
-- =============================================================================
CREATE TABLE Allocation (
    AllocationID    INT             AUTO_INCREMENT          PRIMARY KEY,
    IdentificationNumber VARCHAR(50) NOT NULL,
    RoomID          INT             NOT NULL,

    CheckInDate     DATE            NOT NULL,
    CheckOutDate    DATE            DEFAULT NULL,

    CheckInTime     TIME            DEFAULT NULL,
    CheckOutTime    TIME            DEFAULT NULL,

    AllocatedBy     VARCHAR(100)    DEFAULT NULL,

    AllocationStatus ENUM('Active', 'Completed', 'Cancelled', 'Early Checkout', 'Overstayed') NOT NULL DEFAULT 'Active',

    Remarks         TEXT            DEFAULT NULL,

    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    CreatedBy       VARCHAR(100)    DEFAULT NULL,

    FOREIGN KEY (IdentificationNumber) REFERENCES Member(IdentificationNumber) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (RoomID) REFERENCES Room(RoomID) ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_checkout_after_checkin CHECK (CheckOutDate IS NULL OR CheckOutDate >= CheckInDate)
);

-- =============================================================================
-- TABLE: FurnitureType & FurnitureItem
-- =============================================================================
CREATE TABLE FurnitureType (
    FurnitureTypeID INT             AUTO_INCREMENT          PRIMARY KEY,
    TypeName        VARCHAR(50)     NOT NULL    UNIQUE,
    Description     VARCHAR(200)    DEFAULT NULL,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_furniture_type_name_not_empty CHECK (TRIM(TypeName) <> '')
);

CREATE TABLE FurnitureItem (
    FurnitureItemID INT AUTO_INCREMENT PRIMARY KEY,
    FurnitureTypeID INT NOT NULL,
    RoomID          INT NOT NULL,
    SerialNumber    VARCHAR(50)     DEFAULT NULL,
    FurnitureCondition ENUM('New', 'Good', 'Fair', 'Damaged', 'Needs Repair', 'Out of Service') NOT NULL DEFAULT 'Good',
    LastCheckedDate DATE            DEFAULT NULL,
    Remarks         TEXT            DEFAULT NULL,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (FurnitureTypeID) REFERENCES FurnitureType(FurnitureTypeID) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (RoomID) REFERENCES Room(RoomID) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- TABLE: ComplaintCategory and Complaint
-- =============================================================================
CREATE TABLE ComplaintCategory (
    CategoryID      INT             AUTO_INCREMENT          PRIMARY KEY,
    CategoryName    VARCHAR(100)    NOT NULL    UNIQUE,
    Description     VARCHAR(255)    DEFAULT NULL,
    CreatedAt       DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME                    ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_name_not_empty CHECK (TRIM(CategoryName) <> '')
);

CREATE TABLE Complaint (
    ComplaintID     INT             AUTO_INCREMENT          PRIMARY KEY,
    IdentificationNumber VARCHAR(50) NOT NULL,
    RoomID          INT             DEFAULT NULL,
    CategoryID      INT             NOT NULL,
    Description     TEXT            NOT NULL,
    Severity        ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
    Status          ENUM('Open', 'In Progress', 'Resolved', 'Rejected', 'Closed') NOT NULL DEFAULT 'Open',
    RaisedDate      DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    ResolvedDate    DATETIME        DEFAULT NULL,
    AssignedTo      VARCHAR(100)    DEFAULT NULL,
    ResolutionRemarks TEXT          DEFAULT NULL,
    FOREIGN KEY (IdentificationNumber) REFERENCES Member(IdentificationNumber) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (RoomID)      REFERENCES Room(RoomID)         ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (CategoryID)  REFERENCES ComplaintCategory(CategoryID) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_description_not_empty CHECK (TRIM(Description) <> '')
);

-- =============================================================================
-- TABLE: Visitor
-- =============================================================================
CREATE TABLE Visitor (
    VisitorID       INT             AUTO_INCREMENT          PRIMARY KEY,
    IdentificationNumber VARCHAR(50) NOT NULL,
    VisitorName     VARCHAR(100)    NOT NULL,
    VisitorContact  VARCHAR(20)     NOT NULL,
    Relation        VARCHAR(50)     NOT NULL,
    Purpose         VARCHAR(200)    NOT NULL,
    InDateTime      DATETIME        NOT NULL,
    OutDateTime     DATETIME        DEFAULT NULL,
    GatePassNumber  VARCHAR(50)     DEFAULT NULL,
    Remarks         TEXT            DEFAULT NULL,
    FOREIGN KEY (IdentificationNumber) REFERENCES Member(IdentificationNumber) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_visitor_in_before_out CHECK (OutDateTime IS NULL OR OutDateTime >= InDateTime)
);

-- =============================================================================
-- TABLE: QRScanLog
-- =============================================================================
CREATE TABLE QRScanLog (
    ScanID          INT             AUTO_INCREMENT          PRIMARY KEY,
    QRCode          VARCHAR(100)    NOT NULL,
    ScanType        ENUM('Member', 'Room') NOT NULL,
    ScannedBy       VARCHAR(100)    NOT NULL,
    ScanDateTime    DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    Location        VARCHAR(100)    DEFAULT NULL,
    Remarks         TEXT            DEFAULT NULL,
    IdentificationNumber VARCHAR(50) DEFAULT NULL,
    RoomID          INT             DEFAULT NULL,
    FOREIGN KEY (IdentificationNumber) REFERENCES Member(IdentificationNumber) ON DELETE SET NULL,
    FOREIGN KEY (RoomID)   REFERENCES Room(RoomID)   ON DELETE SET NULL
);

-- =============================================================================
-- TABLE: MaintenanceRequest
-- =============================================================================
CREATE TABLE MaintenanceRequest (
    RequestID       INT             AUTO_INCREMENT          PRIMARY KEY,
    RoomID          INT             NOT NULL,
    RequestedBy     VARCHAR(50)     NOT NULL, -- IdentificationNumber
    Description     TEXT            NOT NULL,
    RequestDate     DATETIME        NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    CompletedDate   DATETIME        DEFAULT NULL,
    Status          ENUM('Pending', 'In Progress', 'Completed', 'Rejected') NOT NULL DEFAULT 'Pending',
    AssignedTo      VARCHAR(100)    DEFAULT NULL,
    FOREIGN KEY (RoomID)      REFERENCES Room(RoomID)       ON DELETE RESTRICT,
    FOREIGN KEY (RequestedBy) REFERENCES Member(IdentificationNumber) ON DELETE RESTRICT
);

-- =============================================================================
-- TABLE: AuditLog
-- =============================================================================
CREATE TABLE IF NOT EXISTS AuditLog (
    LogID           INTEGER PRIMARY KEY AUTOINCREMENT,
    TableName       VARCHAR(50) NOT NULL,
    ActionType      VARCHAR(10) NOT NULL,
    RecordID        VARCHAR(50) NOT NULL, -- IdentificationNumber or other PK
    LogDateTime     DATETIME DEFAULT CURRENT_TIMESTAMP,
    OldData         TEXT,
    NewData         TEXT
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_Member_Update
AFTER UPDATE ON Member
BEGIN
    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldData, NewData)
    VALUES ('Member', 'UPDATE', OLD.IdentificationNumber, 
            'Name:' || OLD.Name || ', Status:' || OLD.IsActive, 
            'Name:' || NEW.Name || ', Status:' || NEW.IsActive);
END;

CREATE TRIGGER IF NOT EXISTS trg_Member_Delete
AFTER DELETE ON Member
BEGIN
    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldData, NewData)
    VALUES ('Member', 'DELETE', OLD.IdentificationNumber, 'Name:' || OLD.Name, NULL);
END;

CREATE TRIGGER IF NOT EXISTS trg_Room_Update
AFTER UPDATE ON Room
BEGIN
    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldData, NewData)
    VALUES ('Room', 'UPDATE', CAST(OLD.RoomID AS TEXT), 
            'Status:' || OLD.RoomStatus || ', Occupied:' || OLD.CurrentOccupancy, 
            'Status:' || NEW.RoomStatus || ', Occupied:' || NEW.CurrentOccupancy);
END;

CREATE TRIGGER IF NOT EXISTS trg_Allocation_Insert
AFTER INSERT ON Allocation
BEGIN
    INSERT INTO AuditLog (TableName, ActionType, RecordID, OldData, NewData)
    VALUES ('Allocation', 'INSERT', CAST(NEW.AllocationID AS TEXT), NULL, 
            'IDNo:' || NEW.IdentificationNumber || ', RoomID:' || NEW.RoomID);
END;

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_members_list          ON Member(IdentificationNumber, Email);

CREATE INDEX IF NOT EXISTS idx_allocations_full      ON Allocation(CheckInDate DESC, IdentificationNumber, RoomID);

CREATE INDEX IF NOT EXISTS idx_rooms_status          ON Room(HostelID);

CREATE INDEX IF NOT EXISTS idx_complaints_full       ON Complaint(IdentificationNumber);

CREATE INDEX IF NOT EXISTS idx_visitors_full         ON Visitor(IdentificationNumber);

CREATE INDEX IF NOT EXISTS idx_maintenance_full      ON MaintenanceRequest(RequestedBy);





