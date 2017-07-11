// TankPlayer.h: interface for the CTankPlayer class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKPLAYER_H__9227C30B_0993_43E9_9FEC_2B4AC7818709__INCLUDED_)
#define AFX_TANKPLAYER_H__9227C30B_0993_43E9_9FEC_2B4AC7818709__INCLUDED_

#include "Weapon.h" 

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

class CTankPlayer : public CWeapon  
{
private:
	float m_fSkillOneCD;//第一技能冷却时间
	float m_fSkillTwoCD;//第二技能冷却时间
	float m_fSkillHealCD;//治疗冷却时间
	bool m_bSkillHealState;//治疗技能状态
	float m_fHealTime;//坦克治疗时间器
	float m_fSkillHealPlayTime;//治疗动画时间
	float m_fMaxSpeed;//坦克最大速度
	int m_iTankState;//坦克状态 0：初始状态;1:正常运动;2:治疗状态;3:加速状态
	float m_fTankBackLine;//制退距离
	float m_fCHangeColorTime;//变颜色时间器
	float m_fFireCD;//开火cd
	bool m_bFireState;//开火状态
	float m_fFireTime;//开火时间器
	float m_fSpeedCD;//加速cd
	bool m_bSpeedState;//加速状态
	float m_fSpeedTime;//加速时间器
	float m_fSpeedCCTime;
public:
	//main
	CTankPlayer(const char*szname);
	virtual ~CTankPlayer();
	virtual void OnMove(){}; //移动方法
	virtual void OnFire(){}; //开火方法
	virtual void OnHeal(){};//治疗方法
	virtual void TankLoop(float fDeltaTime){};//坦克运行中
	virtual void Speed(){};//加速
	void TankBack();//坦克制退
	void OnColMap(int tanktrans);
	void OnColTank();
	void OnColBullet(int owner,float attack);
	//Set
	void SetSkillOneCD(float skillonecd) {m_fSkillOneCD = skillonecd;}
	void SetSkillTwoCD(float skilltwocd) {m_fSkillTwoCD = skilltwocd;}
	void SetSkillHealCD(float skillhealcd) {m_fSkillHealCD = skillhealcd;}
	void SetMaxSpeed(float maxspeed) {m_fMaxSpeed = maxspeed;}
	void SetTankState(float tankstate) {m_iTankState = tankstate;}
	void SetSkillHealState(bool skillstatestate) {m_bSkillHealState = skillstatestate;}
	void SetTankBackLine(float tankbackline) {m_fTankBackLine = tankbackline;}
	void SetSkillHealPlayTime(float playtime) {m_fSkillHealPlayTime = playtime;}
	void SetFireCD(float firecd) {m_fFireCD = firecd;}
	void SetFireState(bool firestate) {m_bFireState = firestate;}
	void SetHealTime(float healtime) {m_fHealTime = healtime;}
	void SetChangeColorTime(float changecolortime) {m_fCHangeColorTime = changecolortime;}
	void SetSpeedCD(float speedcd) {m_fSpeedCD = speedcd;}
	void SetFireTime(float firetime) {m_fFireTime = firetime;}
	void SetSpeedTime(float speedtime) {m_fSpeedTime = speedtime;}
	void SetSpeedState(bool speedstate) {m_bSpeedState = speedstate;}
	void SetSpeedCCTime(float speedcctime) {m_fSpeedCCTime = speedcctime;}
	//Get
	float GetSkillOneCD() {return m_fSkillOneCD;}
	float GetSkillTwoCD() {return m_fSkillTwoCD;}
	float GetSkillHealCD() {return m_fSkillHealCD;}
	float GetMaxSpeed() {return m_fMaxSpeed;}
	float GetTankState() {return m_iTankState;}
	bool GetSkillHealState() {return m_bSkillHealState;}
	float GetTankBackLine() {return m_fTankBackLine;}
	float GetSkillHealPlayTime() {return m_fSkillHealPlayTime;}
	float GetFireCD() {return m_fFireCD;}
	bool GetFireState() {return m_bFireState;}
	float GetFireTime() {return m_fFireTime;}
	float GetHealTime() {return m_fHealTime;}
	float GetChangeColorTime() {return m_fCHangeColorTime;}
	float GetSpeedCD() {return m_fSpeedCD;}
	float GetSpeedTime() {return m_fSpeedTime;}
	bool GetSpeedState() {return m_bSpeedState;}
	float GetSpeedCCTime() {return m_fSpeedCCTime;}
};

#endif // !defined(AFX_TANKPLAYER_H__9227C30B_0993_43E9_9FEC_2B4AC7818709__INCLUDED_)
