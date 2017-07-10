// TankEnemy.h: interface for the CTankEnemy class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_)
#define AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_

#include "Weapon.h" 

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

#include "Weapon.h"

class CTankEnemy : public CWeapon  
{
private:
	float m_fMaxSpeed;//坦克最大速度
	float m_fTankBackLine;//制退距离
	int m_iEnemySpecies;//敌人种类
	int m_iEnemyTarget;//敌人目标
	int m_iEnemyPlace;//敌人出生地
	int m_iEnemyBornTime;//敌人方出生时间
	bool m_bEnemyBorn;
	float m_fChangeDirTime;
	float m_fCHangeColorTime;
	float m_fFireTime;
public:
	//main
	CTankEnemy(const char*szname);
	virtual ~CTankEnemy();
	void OnMove(); //移动方法
	void OnMove(int dir);
	void OnFire(); //开火方法
	void Born();//出生
	void Loop(float fDeltaTime);
	void OnColMap(int tanktrans);
	void OnColTank();
	void OnColBullet(int owner,float attack);
	void TankBack();
	//Get
	float GetMaxSpeed() {return m_fMaxSpeed;}
	float GetTankBackLine() {return m_fTankBackLine;}
	int GetEnemyTarget() {return m_iEnemyTarget;}
	int GetEnemySpecies() {return m_iEnemySpecies;}
	int GetEnemyPlace() {return m_iEnemyPlace;}
	float GetEnemyBornTime() {return m_iEnemyBornTime;}
	bool GetEnemyBorn(){return m_bEnemyBorn;};//敌方坦克出生时间
	//Set
	void SetTankBackLine(float tankbackline) {m_fTankBackLine = tankbackline;}
	void SetMaxSpeed(float maxspeed) {m_fMaxSpeed = maxspeed;}
	void SetEnemySpecies(int enemyspecies ) { m_iEnemySpecies = enemyspecies;}
	void SetEnemyTarget(int enemytarget ) {m_iEnemyTarget = enemytarget;}
	void SetEnemyPlace(int enemyplace) {m_iEnemyPlace = enemyplace;}
	void SetEnemtBornTime(float enemyborntime) {m_iEnemyBornTime = enemyborntime;}
	void SetEnemtBorn(bool enemyborn) {m_bEnemyBorn = enemyborn;}
};
#endif // !defined(AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_)
