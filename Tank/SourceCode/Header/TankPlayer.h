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
	float m_fHealTime;//坦克治疗时间器
	float m_fMaxSpeed;//坦克最大速度
	int m_iTankState;//坦克状态 0：初始状态;1:正常运动;2:治疗状态
	bool m_bSkillHealState;//治疗技能状态
	float m_fSkillHealPlayTime;//治疗动画时间
public:
	//main
	CTankPlayer(const char*szname);
	virtual ~CTankPlayer();
	virtual void OnMove(){}; //移动方法
	virtual void OnFire(){}; //开火方法
	void OnHeal();//治疗方法
	void TankLoop(float fDeltaTime);//坦克运行中
	//Set
	void SetSkillOneCD(float skillonecd) {m_fSkillOneCD = skillonecd;}
	void SetSkillTwoCD(float skilltwocd) {m_fSkillTwoCD = skilltwocd;}
	void SetSkillHealCD(float skillhealcd) {m_fSkillHealCD = skillhealcd;}
	void SetMaxSpeed(float maxspeed) {m_fMaxSpeed = maxspeed;}
	void SetTankState(float tankstate) {m_iTankState = tankstate;}
	void SetSkillHealState(bool skillstatestate) {m_bSkillHealState = skillstatestate;}
	//Get
	float GetSkillOneCD() {return m_fSkillOneCD;}
	float GetSkillTwoCD() {return m_fSkillTwoCD;}
	float GetSkillHealCD() {return m_fSkillHealCD;}
	float GetMaxSpeed() {return m_fMaxSpeed;}
	float GetTankState() {return m_iTankState;}
	bool GetSkillHealState() {return m_bSkillHealState;}
};

#endif // !defined(AFX_TANKPLAYER_H__9227C30B_0993_43E9_9FEC_2B4AC7818709__INCLUDED_)
