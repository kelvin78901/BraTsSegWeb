package com.demo.med.auth;

public class DemoUser {
  public enum Role { DOCTOR }

  private final String userId;
  private final String displayName;
  private final Role role;
  private final String caseRoot;   // data-path for this doctor's case set
  private final String institution;

  public DemoUser(String userId, String displayName, Role role, String caseRoot, String institution) {
    this.userId = userId;
    this.displayName = displayName;
    this.role = role;
    this.caseRoot = caseRoot;
    this.institution = institution;
  }

  public String getUserId()      { return userId; }
  public String getDisplayName() { return displayName; }
  public Role   getRole()        { return role; }
  public String getCaseRoot()    { return caseRoot; }
  public String getInstitution() { return institution; }
}
