// Weapon.h: interface for the CWeapon class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_WEAPON_H__756F199E_987E_4167_9A78_976F417FACA8__INCLUDED_)
#define AFX_WEAPON_H__756F199E_987E_4167_9A78_976F417FACA8__INCLUDED_

#include "CommonClass.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

class CWeapon : public CAnimateSprite  
{
private:
	int m_iDir;//方向0:err;1:A;2:W;3:D;4:S
	int m_iHp;//生命值
	float m_fSpeedX;//x方向上的速度
	float m_fSpeedY;//y方向上的速度
	float m_fAttack;//伤害
public:
	//main
	CWeapon(const char *szname);
	virtual ~CWeapon();
	virtual void OnMove(){}; //移动方法
	virtual void OnFire(){}; //开火方法
	virtual void Born(){};//敌人出生方法
	//Set
	void SetDir(int dir) {m_iDir = dir;}
	void SetHp(int hp) {m_iHp = hp;}
	void SetSpeedX(float speedx) {m_fSpeedX = speedx;}
	void SetSpeedY(float speedy) {m_fSpeedY = speedy;}
	void SetAttack(float attack) {m_fAttack = attack;}
	//Get
	int GetHp()	{return m_iHp;}
	int GetDir() {return m_iDir;}
	float GetSpeedX() {return m_fSpeedX;}
	float GetSpeedY() {return m_fSpeedY;}
	float GetAttack() {return m_fAttack;}
	virtual float GetEnemyBornTime(){return 0;};//敌方坦克出生时间
};

#endif // !defined(AFX_WEAPON_H__756F199E_987E_4167_9A78_976F417FACA8__INCLUDED_)
